"""
forum_api.py — Auth + Forum backend for Agri.

Kept as its own small Flask app (separate from app.py, which runs the
TensorFlow disease-detection model) on purpose: this needs zero heavy
dependencies and starts in under a second, which matters when you're
trying to get a real demo running fast. Both apps can eventually be
merged behind a single reverse proxy / gateway later if desired — for
now they just run on two ports (predict: 5000, this: 5001).

Run:
    pip install -r requirements_forum.txt
    python forum_api.py
Creates agri_forum.db (SQLite file) in this folder on first run, with
seed categories + a demo user + demo posts.
"""

import os
import re
from datetime import timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///agri_forum.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'dev-secret-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)

db = SQLAlchemy(app)
jwt = JWTManager(app)

# ---------------------------------------------------------------- Models --

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='user')  # 'user' | 'admin'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    profile = db.relationship('FarmerProfile', uselist=False, back_populates='user')

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "email": self.email, "role": self.role,
            "profile": self.profile.to_dict() if self.profile else None,
        }


class FarmerProfile(db.Model):
    """Farm details for a user. One row per user, keyed on the same user.id the forum uses."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    phone = db.Column(db.String(20))
    farm_name = db.Column(db.String(120))
    state = db.Column(db.String(60))
    district = db.Column(db.String(80))
    primary_crop = db.Column(db.String(60))
    land_acres = db.Column(db.Float)
    field_id = db.Column(db.String(40), unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', back_populates='profile')

    def to_dict(self):
        return {
            "phone": self.phone, "farmName": self.farm_name, "state": self.state,
            "district": self.district, "primaryCrop": self.primary_crop,
            "landAcres": self.land_acres, "fieldId": self.field_id,
        }


class Category(db.Model):
    id = db.Column(db.String(40), primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description}


class Post(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    content = db.Column(db.Text, nullable=False)
    category_id = db.Column(db.String(40), db.ForeignKey('category.id'), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    tags = db.Column(db.String(255), default='')  # comma-separated
    status = db.Column(db.String(20), default='active')  # 'active' | 'removed'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    author = db.relationship('User')

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "categoryId": self.category_id,
            "authorName": self.author.name,
            "authorId": self.author_id,
            "tags": [t for t in self.tags.split(',') if t],
            "status": self.status,
            "createdAt": self.created_at.isoformat(),
            "likeCount": Like.query.filter_by(post_id=self.id).count(),
            "commentCount": Comment.query.filter_by(post_id=self.id).count(),
        }


class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('post.id'), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('comment.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    author = db.relationship('User')

    def to_dict(self):
        return {
            "id": self.id, "postId": self.post_id, "authorName": self.author.name,
            "content": self.content, "parentId": self.parent_id,
            "createdAt": self.created_at.isoformat(),
        }


class Like(db.Model):
    post_id = db.Column(db.Integer, db.ForeignKey('post.id'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)


class Report(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    target_type = db.Column(db.String(20))  # 'post' | 'comment'
    target_id = db.Column(db.Integer)
    post_id = db.Column(db.Integer, db.ForeignKey('post.id'))
    reason = db.Column(db.String(255))
    reported_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    status = db.Column(db.String(20), default='pending')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


DEFAULT_CATEGORIES = [
    ("crop-farming", "Crop & Farming", "General cultivation, sowing, harvesting"),
    ("pest-disease", "Pest & Disease", "Identification and treatment"),
    ("irrigation", "Irrigation", "Water scheduling, drip/sprinkler setups"),
    ("fertilizers-soil", "Fertilizers & Soil", "Nutrients, soil health, testing"),
    ("govt-schemes", "Government Schemes", "Subsidies, MSP, insurance"),
    ("market-prices", "Market & Prices", "Mandi rates, selling advice"),
    ("equipment", "Equipment", "Tools, machinery, maintenance"),
    ("general", "General Discussion", "Everything else"),
]


def seed():
    if Category.query.count() == 0:
        for cid, name, desc in DEFAULT_CATEGORIES:
            db.session.add(Category(id=cid, name=name, description=desc))
    if User.query.filter_by(email="arjun@agrovista.in").first() is None:
        db.session.add(User(
            name="Arjun Sharma", email="arjun@agrovista.in",
            password_hash=generate_password_hash("farm@123"), role="admin",
        ))
    db.session.commit()

    if Post.query.count() == 0:
        u = User.query.filter_by(email="arjun@agrovista.in").first()
        db.session.add(Post(
            title="Yellowing leaves on sugarcane after last week's rain — normal?",
            content="Noticed the lower leaves turning yellow after heavy rain. Wondering if it's nitrogen leaching or yellow leaf disease.",
            category_id="pest-disease", author_id=u.id, tags="sugarcane,yellowing,rain",
        ))
        db.session.add(Post(
            title="Best drip irrigation spacing for wheat in black cotton soil?",
            content="Switching from flood to drip this season. What lateral spacing has worked for others in similar soil?",
            category_id="irrigation", author_id=u.id, tags="drip-irrigation,wheat,black-soil",
        ))
        db.session.commit()


# ------------------------------------------------------------------ Auth --

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
PHONE_RE = re.compile(r'^\+?[0-9][0-9 \-]{6,18}$')
MIN_PASSWORD_LEN = 6


def _clean_str(value, max_len):
    return value.strip()[:max_len] if isinstance(value, str) and value.strip() else None


def parse_profile(data):
    """Validate the optional farm-detail fields. Returns (fields, error)."""
    fields = {
        "phone": _clean_str(data.get('phone'), 20),
        "farm_name": _clean_str(data.get('farmName'), 120),
        "state": _clean_str(data.get('state'), 60),
        "district": _clean_str(data.get('district'), 80),
        "primary_crop": _clean_str(data.get('primaryCrop'), 60),
        "land_acres": None,
    }
    if fields["phone"] and not PHONE_RE.match(fields["phone"]):
        return None, "Enter a valid mobile number"
    acres = data.get('landAcres')
    if acres not in (None, ''):
        try:
            acres = float(acres)
        except (TypeError, ValueError):
            return None, "Land size must be a number"
        if not 0 < acres <= 100000:
            return None, "Land size must be greater than 0"
        fields["land_acres"] = acres
    return fields, None


@app.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json(silent=True) or {}
    name = _clean_str(data.get('name'), 100)
    email = _clean_str(data.get('email'), 150)
    password = data.get('password')
    if not name or not email or not password:
        return jsonify({"error": "name, email, and password are required"}), 400
    email = email.lower()
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address"}), 400
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LEN:
        return jsonify({"error": f"Password must be at least {MIN_PASSWORD_LEN} characters"}), 400
    fields, err = parse_profile(data)
    if err:
        return jsonify({"error": err}), 400
    if User.query.filter(func.lower(User.email) == email).first():
        return jsonify({"error": "An account with this email already exists"}), 409

    user = User(name=name, email=email, password_hash=generate_password_hash(password))
    try:
        # User + profile are written in one transaction, so a failure leaves neither behind.
        db.session.add(user)
        db.session.flush()  # assigns user.id
        db.session.add(FarmerProfile(user_id=user.id, field_id=f"FU-{user.id:04d}", **fields))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "An account with this email already exists"}), 409
    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()}), 201


@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    email, password = data.get('email'), data.get('password')
    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({"error": "Invalid email or password"}), 401
    user = User.query.filter(func.lower(User.email) == email.strip().lower()).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password"}), 401
    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()})


@app.route('/auth/me', methods=['GET'])
@jwt_required()
def me():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user.to_dict())


# ---------------------------------------------------------------- Profile --
# Both endpoints act only on the user in the JWT; no user id is accepted from the client.

@app.route('/farmer/profile', methods=['GET'])
@jwt_required()
def get_profile():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"profile": user.profile.to_dict() if user.profile else None})


@app.route('/farmer/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify({"error": "User not found"}), 404
    fields, err = parse_profile(request.get_json(silent=True) or {})
    if err:
        return jsonify({"error": err}), 400
    if user.profile is None:
        user.profile = FarmerProfile(user_id=user.id, field_id=f"FU-{user.id:04d}")
    for key, value in fields.items():
        setattr(user.profile, key, value)
    db.session.commit()
    return jsonify({"profile": user.profile.to_dict()})


# ----------------------------------------------------------------- Forum --

@app.route('/forum/categories', methods=['GET'])
def get_categories():
    return jsonify([c.to_dict() for c in Category.query.all()])


@app.route('/forum/posts', methods=['GET'])
def get_posts():
    q = Post.query.filter_by(status='active')
    category_id = request.args.get('categoryId')
    search = request.args.get('search')
    sort = request.args.get('sort', 'latest')

    if category_id:
        q = q.filter_by(category_id=category_id)
    if search:
        like = f"%{search}%"
        q = q.filter(db.or_(Post.title.ilike(like), Post.content.ilike(like), Post.tags.ilike(like)))

    posts = [p.to_dict() for p in q.all()]
    if sort == 'latest':
        posts.sort(key=lambda p: p['createdAt'], reverse=True)
    elif sort == 'popular':
        posts.sort(key=lambda p: p['likeCount'] + p['commentCount'], reverse=True)
    elif sort == 'most-commented':
        posts.sort(key=lambda p: p['commentCount'], reverse=True)
    return jsonify(posts)


@app.route('/forum/posts/<int:post_id>', methods=['GET'])
def get_post(post_id):
    post = db.session.get(Post, post_id)
    if not post or post.status != 'active':
        return jsonify({"error": "Post not found"}), 404
    data = post.to_dict()
    data['likes'] = [l.user_id for l in Like.query.filter_by(post_id=post_id).all()]
    data['comments'] = [c.to_dict() for c in Comment.query.filter_by(post_id=post_id).order_by(Comment.created_at).all()]
    return jsonify(data)


@app.route('/forum/posts', methods=['POST'])
@jwt_required()
def create_post():
    data = request.get_json() or {}
    title, content, category_id = data.get('title'), data.get('content'), data.get('categoryId')
    if not title or not content or not category_id:
        return jsonify({"error": "title, content, and categoryId are required"}), 400
    post = Post(
        title=title.strip()[:150], content=content.strip()[:5000], category_id=category_id,
        author_id=int(get_jwt_identity()), tags=','.join(data.get('tags', []))[:255],
    )
    db.session.add(post)
    db.session.commit()
    return jsonify(post.to_dict()), 201


@app.route('/forum/posts/<int:post_id>/comments', methods=['POST'])
@jwt_required()
def add_comment(post_id):
    data = request.get_json() or {}
    content = data.get('content')
    if not content or not content.strip():
        return jsonify({"error": "Comment cannot be empty"}), 400
    if not db.session.get(Post, post_id):
        return jsonify({"error": "Post not found"}), 404
    comment = Comment(
        post_id=post_id, author_id=int(get_jwt_identity()),
        content=content.strip()[:1000], parent_id=data.get('parentId'),
    )
    db.session.add(comment)
    db.session.commit()
    return jsonify(comment.to_dict()), 201


@app.route('/forum/posts/<int:post_id>/like', methods=['POST'])
@jwt_required()
def toggle_like(post_id):
    user_id = int(get_jwt_identity())
    existing = Like.query.filter_by(post_id=post_id, user_id=user_id).first()
    if existing:
        db.session.delete(existing)
    else:
        db.session.add(Like(post_id=post_id, user_id=user_id))
    db.session.commit()
    likes = [l.user_id for l in Like.query.filter_by(post_id=post_id).all()]
    return jsonify({"likes": likes})


@app.route('/forum/posts/<int:post_id>/report', methods=['POST'])
@jwt_required()
def report_post(post_id):
    data = request.get_json() or {}
    r = Report(
        target_type=data.get('type', 'post'), target_id=data.get('targetId', post_id),
        post_id=post_id, reason=data.get('reason', 'Flagged by user'),
        reported_by=int(get_jwt_identity()),
    )
    db.session.add(r)
    db.session.commit()
    return jsonify({"status": "reported"}), 201


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed()
    app.run(debug=False, port=5001)
