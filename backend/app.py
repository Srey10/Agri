import os

os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from PIL import Image as PILImage
import zipfile
import json
import tempfile
import shutil
import requests
from dotenv import load_dotenv


# ============================================================
# ENVIRONMENT
# ============================================================

load_dotenv()


# ============================================================
# FLASK APP
# ============================================================

app = Flask(__name__)
CORS(app)


# ============================================================
# DISEASE MODEL CONFIGURATION
# ============================================================

classes = [
    'Healthy',
    'Mosaic',
    'RedRot',
    'Rust',
    'Yellow'
]


treatment_map = {
    "Healthy":
        "The crop appears healthy. Maintain proper irrigation, "
        "balanced fertilization, and regular field monitoring.",

    "Mosaic":
        "Viral disease spread by aphids. Remove infected plants. "
        "Apply Imidacloprid. Use disease-free planting material.",

    "RedRot":
        "Serious fungal disease. Uproot and burn infected canes. "
        "Apply Carbendazim 0.1%. Ensure proper drainage.",

    "Rust":
        "Fungal infection. Apply Mancozeb or Propiconazole. "
        "Improve air circulation. Avoid excess nitrogen.",

    "Yellow":
        "Nutrient deficiency or yellow leaf disease. Apply balanced "
        "NPK fertilizers. Improve soil drainage.",
}


# ============================================================
# FILE / MODEL CONFIGURATION
# ============================================================

UPLOAD_FOLDER = "uploads"

os.makedirs(
    UPLOAD_FOLDER,
    exist_ok=True
)

MODEL_PATH = "model/sugarcane_disease_model.keras"


# ============================================================
# SENTINEL-2 CONFIGURATION
# ============================================================

SENTINEL_CLIENT_ID = os.getenv(
    "SENTINEL_CLIENT_ID"
)

SENTINEL_CLIENT_SECRET = os.getenv(
    "SENTINEL_CLIENT_SECRET"
)


SENTINEL_TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/"
    "auth/realms/CDSE/protocol/openid-connect/token"
)


SENTINEL_STATS_URL = (
    "https://sh.dataspace.copernicus.eu/statistics/v1"
)


# ============================================================
# MODEL LOADING
# ============================================================

def patch_and_load_model():

    """
    Patch the model config to fix the batch_shape mismatch
    between the Sequential wrapper and the inner EfficientNet
    InputLayer, then load with Keras 3.
    """

    import tensorflow as tf

    # Extract the .keras zip
    tmp_dir = tempfile.mkdtemp()

    try:

        with zipfile.ZipFile(
            MODEL_PATH,
            'r'
        ) as z:

            z.extractall(
                tmp_dir
            )


        config_path = os.path.join(
            tmp_dir,
            'config.json'
        )


        with open(
            config_path,
            'r'
        ) as f:

            config = json.load(f)


        config_str = json.dumps(
            config
        )


        # Simple replacement for Keras 3 compatibility

        config_str_fixed = config_str.replace(
            '"batch_shape": [null, 224, 224, 3]',
            '"shape": [224, 224, 3]'
        ).replace(
            '"batch_shape":[null,224,224,3]',
            '"shape":[224,224,3]'
        )


        with open(
            config_path,
            'w'
        ) as f:

            f.write(
                config_str_fixed
            )


        # Rebuild patched .keras file

        patched_path = os.path.join(
            tmp_dir,
            'patched_model.keras'
        )


        with zipfile.ZipFile(
            patched_path,
            'w',
            zipfile.ZIP_DEFLATED
        ) as zout:

            for root, dirs, files in os.walk(
                tmp_dir
            ):

                for file in files:

                    if file == 'patched_model.keras':
                        continue


                    filepath = os.path.join(
                        root,
                        file
                    )


                    arcname = os.path.relpath(
                        filepath,
                        tmp_dir
                    )


                    zout.write(
                        filepath,
                        arcname
                    )


        model = tf.keras.models.load_model(
            patched_path
        )


        print(
            f"Model loaded OK. "
            f"Input: {model.input_shape}, "
            f"Output: {model.output_shape}"
        )


        return model


    finally:

        shutil.rmtree(
            tmp_dir,
            ignore_errors=True
        )


# ============================================================
# LOAD MODEL
# ============================================================

print(
    "Loading model..."
)

model = patch_and_load_model()

print(
    "Model ready."
)


# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def preprocess_image(path):

    """
    Load image as RGB 224x224,
    apply EfficientNet preprocessing
    (scale to [-1, 1]).
    """

    img = PILImage.open(
        path
    ).convert('RGB')


    img = img.resize(
        (224, 224)
    )


    img_array = np.array(
        img,
        dtype=np.float32
    )


    img_array = (
        img_array / 127.5
    ) - 1.0


    return np.expand_dims(
        img_array,
        axis=0
    )


# ============================================================
# SENTINEL AUTHENTICATION
# ============================================================

def get_sentinel_token():

    if (
        not SENTINEL_CLIENT_ID
        or not SENTINEL_CLIENT_SECRET
    ):

        raise RuntimeError(
            "Sentinel Hub credentials are missing. "
            "Check your .env file."
        )


    response = requests.post(

        SENTINEL_TOKEN_URL,

        data={
            "grant_type":
                "client_credentials",

            "client_id":
                SENTINEL_CLIENT_ID,

            "client_secret":
                SENTINEL_CLIENT_SECRET,
        },

        timeout=30
    )


    response.raise_for_status()


    return response.json()[
        "access_token"
    ]


# ============================================================
# NDVI ENDPOINT
# ============================================================

@app.route(
    '/ndvi',
    methods=['POST']
)
def get_ndvi():

    try:

        # ----------------------------------------------------
        # RECEIVE GEOMETRY FROM REACT
        # ----------------------------------------------------

        data = request.get_json()


        if (
            not data
            or "geometry" not in data
        ):

            return jsonify({
                "error":
                    "GeoJSON geometry is required"
            }), 400


        geometry = data[
            "geometry"
        ]


        # ----------------------------------------------------
        # SENTINEL-2 NDVI EVALSCRIPT
        # ----------------------------------------------------
        #
        # B04 = Red
        # B08 = Near Infrared
        #
        # NDVI = (B08 - B04) / (B08 + B04)
        #
        # SCL is used to remove:
        # 3  = Cloud shadow
        # 8  = Cloud medium probability
        # 9  = Cloud high probability
        # 10 = Cirrus
        #
        # dataMask removes invalid pixels.
        # ----------------------------------------------------

        evalscript = """

        //VERSION=3

        function setup() {

            return {

                input: [{
                    bands: [
                        "B04",
                        "B08",
                        "SCL",
                        "dataMask"
                    ]
                }],

                output: [

                    {
                        id: "ndvi",
                        bands: 1,
                        sampleType: "FLOAT32"
                    },

                    {
                        id: "dataMask",
                        bands: 1
                    }

                ]

            };

        }


        function evaluatePixel(samples) {

            let denominator =
                samples.B08 + samples.B04;


            let ndvi =
                denominator == 0
                    ? 0
                    : (
                        samples.B08 -
                        samples.B04
                    ) / denominator;


            let valid =
                samples.SCL != 3 &&
                samples.SCL != 8 &&
                samples.SCL != 9 &&
                samples.SCL != 10 &&
                samples.dataMask == 1;


            return {

                ndvi: [ndvi],

                dataMask: [
                    valid ? 1 : 0
                ]

            };

        }

        """


        # ----------------------------------------------------
        # GET SENTINEL TOKEN
        # ----------------------------------------------------

        token = get_sentinel_token()


        # ----------------------------------------------------
        # SENTINEL STATISTICAL API REQUEST
        # ----------------------------------------------------
        #
        # The CRS is explicitly WGS84 / EPSG:4326.
        #
        # 0.00009 degrees is approximately 10 metres
        # at this latitude.
        # ----------------------------------------------------

        request_body = {

            "input": {

                "bounds": {

                    "geometry":
                        geometry,

                    "properties": {

                        "crs":
                            "http://www.opengis.net/"
                            "def/crs/EPSG/0/4326"

                    }

                },


                "data": [

                    {

                        "type":
                            "sentinel-2-l2a",

                        "dataFilter": {

                            "mosaickingOrder":
                                "leastCC"

                        }

                    }

                ]

            },


            "aggregation": {

                "timeRange": {

                    "from":
                        "2026-08-01T00:00:00Z",

                    "to":
                        "2026-09-02T23:59:59Z"

                },


                # One period across the entire
                # requested date range.
                #
                # Sentinel will calculate the
                # statistics for this zone.

                "aggregationInterval": {

                    "of":
                        "P32D"

                },


                "evalscript":
                    evalscript,


                # Approximately 10 metre pixels
                # in WGS84 coordinates.

                "resx":
                    0.00009,

                "resy":
                    0.00009

            },


            # Ask Sentinel for statistics
            # for our NDVI output.

            "calculations": {

                "ndvi": {

                    "statistics": {}

                }

            }

        }


        # ----------------------------------------------------
        # SEND REQUEST TO SENTINEL
        # ----------------------------------------------------

        response = requests.post(

            SENTINEL_STATS_URL,

            headers={

                "Authorization":
                    f"Bearer {token}",

                "Content-Type":
                    "application/json",

                "Accept":
                    "application/json"

            },

            json=request_body,

            timeout=120

        )


        response.raise_for_status()


        result = response.json()


        # ----------------------------------------------------
        # EXTRACT REAL NDVI VALUE
        # ----------------------------------------------------

        ndvi_value = None

        pixel_count = 0

        nodata_count = 0


        for item in result.get(
            "data",
            []
        ):

            stats = (

                item

                .get(
                    "outputs",
                    {}
                )

                .get(
                    "ndvi",
                    {}
                )

                .get(
                    "bands",
                    {}
                )

                .get(
                    "B0",
                    {}
                )

                .get(
                    "stats",
                    {}
                )

            )


            mean = stats.get(
                "mean"
            )


            # Ignore NaN / invalid observations

            if (

                mean is not None

                and str(mean).lower()
                    != "nan"

            ):

                ndvi_value = float(
                    mean
                )


                pixel_count = stats.get(
                    "sampleCount",
                    0
                )


                nodata_count = stats.get(
                    "noDataCount",
                    0
                )


                break


        # ----------------------------------------------------
        # RETURN CLEAN RESPONSE TO REACT
        # ----------------------------------------------------

        return jsonify({

            "ndvi":
                ndvi_value,

            "pixels":
                pixel_count,

            "nodata":
                nodata_count,

            "status":
                result.get(
                    "status"
                ),

            "geometryPixelCount":
                result.get(
                    "geometryPixelCount",
                    0
                )

        })


    # --------------------------------------------------------
    # SENTINEL HTTP ERROR
    # --------------------------------------------------------

    except requests.exceptions.HTTPError as e:

        return jsonify({

            "error":
                "Sentinel Hub request failed",

            "details":
                (
                    e.response.text
                    if e.response
                    else str(e)
                )

        }), 502


    # --------------------------------------------------------
    # GENERAL ERROR
    # --------------------------------------------------------

    except Exception as e:

        return jsonify({

            "error":
                str(e)

        }), 500


# ============================================================
# EXISTING PREDICT ENDPOINT - UNCHANGED
# ============================================================

@app.route(
    '/predict',
    methods=['POST']
)
def predict():

    if 'image' not in request.files:

        return jsonify({

            "error":
                "No image file provided"

        }), 400


    file = request.files[
        'image'
    ]


    path = os.path.join(

        UPLOAD_FOLDER,

        file.filename

    )


    file.save(
        path
    )


    try:

        img_array = preprocess_image(
            path
        )


        prediction = model.predict(

            img_array,

            verbose=0

        )


        idx = int(
            np.argmax(
                prediction
            )
        )


        disease = classes[
            idx
        ]


        confidence = round(

            float(
                np.max(
                    prediction
                ) * 100
            ),

            2

        )


        return jsonify({

            "disease":
                disease,

            "confidence":
                confidence,

            "treatment":
                treatment_map[
                    disease
                ]

        })


    except Exception as e:

        return jsonify({

            "error":
                str(e)

        }), 500


# ============================================================
# EXISTING HEALTH ENDPOINT - UNCHANGED
# ============================================================

@app.route(
    '/health',
    methods=['GET']
)
def health():

    return jsonify({

        "status":
            "ok",

        "model":
            "sugarcane_disease_model",

        "classes":
            classes

    })


# ============================================================
# START FLASK
# ============================================================

if __name__ == "__main__":

    app.run(

        debug=True,

        port=5000

    )