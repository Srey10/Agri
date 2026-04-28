from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import tensorflow as tf
from tensorflow.keras.preprocessing import image
from tensorflow.keras.applications.efficientnet import preprocess_input
import os

app = Flask(__name__)
CORS(app)

model = tf.keras.models.load_model("model/sugarcane_disease_model.keras")

classes = ['Healthy', 'Mosaic', 'RedRot', 'Rust', 'Yellow']

treatment_map = {
    "Healthy": "The crop appears healthy. Maintain proper irrigation, balanced fertilization, and regular field monitoring to prevent future infections.",

    "Mosaic": "This is a viral disease spread by aphids. Remove and destroy infected plants immediately. Control aphid population using insecticides like Imidacloprid. Use disease-free planting material.",

    "RedRot": "A serious fungal disease. Uproot and burn infected canes to stop spread. Treat setts with Carbendazim before planting. Ensure proper drainage and avoid water stagnation.",

    "Rust": "Caused by fungal infection. Apply fungicides such as Mancozeb or Propiconazole. Improve air circulation by proper spacing and avoid excess nitrogen fertilizers.",

    "Yellow": "Indicates nutrient deficiency or yellow leaf disease. Apply balanced fertilizers, especially nitrogen and micronutrients. Improve soil drainage and use resistant varieties if available."
}


UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.route('/predict', methods=['POST'])
def predict():
    file = request.files['image']

    path = os.path.join(UPLOAD_FOLDER, file.filename)
    file.save(path)

    img = image.load_img(path, target_size=(224, 224))
    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0)
    img_array = preprocess_input(img_array)

    prediction = model.predict(img_array, verbose=0)

    idx = np.argmax(prediction)
    disease = classes[idx]
    confidence = float(np.max(prediction) * 100)

    return jsonify({
        "disease": disease,
        "confidence": confidence,
        "treatment": treatment_map[disease]
    })


if __name__ == "__main__":
    app.run(debug=True)