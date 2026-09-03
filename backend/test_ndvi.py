import os
import requests
from dotenv import load_dotenv

load_dotenv()

CLIENT_ID = os.getenv("SENTINEL_CLIENT_ID")
CLIENT_SECRET = os.getenv("SENTINEL_CLIENT_SECRET")

TOKEN_URL = (
    "https://identity.dataspace.copernicus.eu/"
    "auth/realms/CDSE/protocol/openid-connect/token"
)

STATS_URL = "https://sh.dataspace.copernicus.eu/statistics/v1"

FARM_BOUNDARY = {
    "type": "Polygon",
    "coordinates": [[
        [74.8985, 19.4330],
        [74.9010, 19.4345],
        [74.9045, 19.4340],
        [74.9055, 19.4315],
        [74.9050, 19.4285],
        [74.9020, 19.4270],
        [74.8990, 19.4275],
        [74.8975, 19.4300],
        [74.8985, 19.4330]
    ]]
}


def get_token():
    response = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET
        },
        timeout=30
    )

    response.raise_for_status()
    return response.json()["access_token"]


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

    let ndvi = (samples.B08 - samples.B04) /
               (samples.B08 + samples.B04);

    // Exclude clouds, cirrus and cloud shadows
    let valid =
        samples.SCL != 3 &&
        samples.SCL != 8 &&
        samples.SCL != 9 &&
        samples.SCL != 10 &&
        samples.dataMask == 1;

    return {
        ndvi: [ndvi],
        dataMask: [valid ? 1 : 0]
    };
}
"""


token = get_token()

request_body = {
    "input": {
        "bounds": {
            "geometry": FARM_BOUNDARY,
            "properties": {
        "crs": "http://www.opengis.net/def/crs/EPSG/0/4326"
    }
        },
        "data": [
            {
                "type": "sentinel-2-l2a",
                "dataFilter": {
                    "mosaickingOrder": "leastCC"
                }
            }
        ]
    },

    "aggregation": {
        "timeRange": {
            "from": "2026-08-01T00:00:00Z",
            "to": "2026-09-02T00:00:00Z"
        },

        "aggregationInterval": {
            "of": "P1D"
        },

        "evalscript": evalscript,

        "resx": 0.00009,
        "resy": 0.00009
    }
}


headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}


response = requests.post(
    STATS_URL,
    headers=headers,
    json=request_body,
    timeout=120
)

print("SENTINEL STATUS:", response.status_code)

data = response.json()

print("\nSTATUS:", data.get("status"))
print("GEOMETRY PIXEL COUNT:", data.get("geometryPixelCount"))

print("\nRESULTS:")

for item in data.get("data", []):

    interval = item["interval"]

    stats = (
        item
        .get("outputs", {})
        .get("ndvi", {})
        .get("bands", {})
        .get("B0", {})
        .get("stats", {})
    )

    if stats:
        print(
            f"{interval['from'][:10]}  "
            f"NDVI mean={stats.get('mean')}  "
            f"min={stats.get('min')}  "
            f"max={stats.get('max')}  "
            f"pixels={stats.get('sampleCount')}  "
            f"nodata={stats.get('noDataCount')}"
        )