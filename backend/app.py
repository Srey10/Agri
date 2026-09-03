import os

os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import tensorflow as tf
from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.efficientnet import preprocess_input
import requests
from dotenv import load_dotenv
import time


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
# LOAD MODEL — WORKING MODEL LOADING
# ============================================================

print("Loading model...")

model = tf.keras.models.load_model(MODEL_PATH)

print("Model ready.")


# ============================================================
# SENTINEL AUTHENTICATION
# ============================================================

# Cache the Sentinel token so every zone does NOT request
# a new OAuth token.
SENTINEL_ACCESS_TOKEN = None
SENTINEL_TOKEN_EXPIRES_AT = 0


def get_sentinel_token(force_refresh=False):

    global SENTINEL_ACCESS_TOKEN
    global SENTINEL_TOKEN_EXPIRES_AT

    # Reuse the existing token if it is still valid.
    # Refresh one minute before expiry.
    if (
        not force_refresh
        and SENTINEL_ACCESS_TOKEN
        and time.time() < SENTINEL_TOKEN_EXPIRES_AT - 60
    ):
        return SENTINEL_ACCESS_TOKEN

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

    token_data = response.json()

    SENTINEL_ACCESS_TOKEN = token_data[
        "access_token"
    ]

    # Sentinel normally returns expires_in.
    # Keep a safe fallback if it is missing.
    expires_in = token_data.get(
        "expires_in",
        600
    )

    SENTINEL_TOKEN_EXPIRES_AT = (
        time.time() + expires_in
    )

    return SENTINEL_ACCESS_TOKEN


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
        # WITH RETRIES
        # ----------------------------------------------------

        response = None

        for attempt in range(3):

            try:

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

            except requests.exceptions.RequestException as e:

                print(
                    f"Sentinel connection error "
                    f"(attempt {attempt + 1}/3): {e}"
                )

                if attempt == 2:
                    raise

                time.sleep(
                    2 ** attempt
                )

                continue


            # ------------------------------------------------
            # SUCCESS
            # ------------------------------------------------

            if response.status_code == 200:

                break


            # ------------------------------------------------
            # TOKEN EXPIRED
            # ------------------------------------------------

            if response.status_code == 401:

                print(
                    "Sentinel token expired. "
                    "Refreshing token..."
                )

                token = get_sentinel_token(
                    force_refresh=True
                )

                if attempt < 2:
                    continue


            # ------------------------------------------------
            # TEMPORARY SENTINEL ERROR
            # ------------------------------------------------

            if response.status_code in (
                429,
                500,
                502,
                503,
                504
            ):

                wait_time = 2 ** attempt

                print(
                    f"Sentinel returned "
                    f"{response.status_code}. "
                    f"Retrying in {wait_time}s..."
                )

                if attempt < 2:

                    time.sleep(
                        wait_time
                    )

                    continue


            # ------------------------------------------------
            # OTHER HTTP ERROR
            # ------------------------------------------------

            response.raise_for_status()


        # ----------------------------------------------------
        # FINAL CHECK
        # ----------------------------------------------------

        if (
            response is None
            or response.status_code != 200
        ):

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
        # LOG RESULT
        # ----------------------------------------------------

        print(
            f"NDVI result: "
            f"{ndvi_value} | "
            f"pixels: {pixel_count} | "
            f"nodata: {nodata_count}"
        )


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

        details = (
            e.response.text
            if e.response
            else str(e)
        )

        print(
            "Sentinel HTTP error:",
            details
        )

        return jsonify({

            "error":
                "Sentinel Hub request failed",

            "details":
                details

        }), 502


    # --------------------------------------------------------
    # GENERAL ERROR
    # --------------------------------------------------------

    except Exception as e:

        print(
            "NDVI error:",
            str(e)
        )

        return jsonify({

            "error":
                str(e)

        }), 500


# ============================================================
# PREDICT ENDPOINT — ORIGINAL WORKING PREPROCESSING
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

        # ----------------------------------------------------
        # ORIGINAL WORKING PREPROCESSING
        # ----------------------------------------------------

        img = image.load_img(
            path,
            target_size=(224, 224)
        )


        img_array = image.img_to_array(
            img
        )


        img_array = np.expand_dims(
            img_array,
            axis=0
        )


        img_array = preprocess_input(
            img_array
        )


        # ----------------------------------------------------
        # MODEL PREDICTION
        # ----------------------------------------------------

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
# HEALTH ENDPOINT — UNCHANGED
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