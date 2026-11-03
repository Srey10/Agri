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

import json
import os
import re
from datetime import timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
from sqlalchemy import func, inspect, text, UniqueConstraint
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash, check_password_hash
from farm_geometry import validate_polygon
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
    fields = db.relationship('Field', order_by='Field.id', back_populates='user')

    @property
    def mapping_complete(self):
        # A farm counts as mapped once the farmer has at least one field (or a legacy boundary).
        return bool(self.fields or (self.profile and self.profile.farm_boundary))

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "email": self.email, "role": self.role,
            "profile": self.profile.to_dict() if self.profile else None,
            "mappingComplete": self.mapping_complete,
            # The first field is the "primary" one; it is mirrored into profile.farm_boundary
            # so the original single-boundary API keeps working.
            "fields": [f.to_dict(is_primary=(i == 0)) for i, f in enumerate(self.fields)],
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
    farm_boundary = db.Column(db.Text)  # GeoJSON Polygon as JSON text; NULL until the farmer maps the farm
    boundary_updated_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', back_populates='profile')

    def to_dict(self):
        return {
            "phone": self.phone, "farmName": self.farm_name, "state": self.state,
            "district": self.district, "primaryCrop": self.primary_crop,
            "landAcres": self.land_acres, "fieldId": self.field_id,
            "farmBoundary": json.loads(self.farm_boundary) if self.farm_boundary else None,
            "mappingComplete": bool(self.farm_boundary),
        }


MAX_FIELDS_PER_FARMER = 20


class Field(db.Model):
    """One mapped field (plot) belonging to a farmer."""
    __tablename__ = 'farm_field'
    __table_args__ = (UniqueConstraint('user_id', 'name', name='uq_farm_field_user_name'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    boundary = db.Column(db.Text, nullable=False)  # GeoJSON Polygon as JSON text
    area_ha = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship('User', back_populates='fields')

    def to_dict(self, is_primary=False):
        return {
            "id": self.id, "name": self.name, "boundary": json.loads(self.boundary),
            "areaHectares": self.area_ha, "isPrimary": is_primary,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
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


def ensure_schema():
    """
    Add columns introduced after a table was first created. db.create_all() only
    creates missing tables, so existing databases need this. It only ever adds
    nullable columns; it never drops or rewrites data.
    """
    insp = inspect(db.engine)
    if 'farmer_profile' not in insp.get_table_names():
        return
    existing = {c['name'] for c in insp.get_columns('farmer_profile')}
    wanted = {'farm_boundary': 'TEXT', 'boundary_updated_at': 'DATETIME'}
    with db.engine.begin() as conn:
        for name, sql_type in wanted.items():
            if name not in existing:
                conn.execute(text(f'ALTER TABLE farmer_profile ADD COLUMN {name} {sql_type}'))


DEFAULT_FIELD_NAME = 'Main field'


def backfill_fields():
    """
    Turn each existing single farm boundary into that farmer's first field.
    Repeatable: only farmers with no field yet are touched, and nothing is deleted or overwritten.
    """
    changed = False
    for profile in FarmerProfile.query.filter(FarmerProfile.farm_boundary.isnot(None)).all():
        if Field.query.filter_by(user_id=profile.user_id).first():
            continue
        _, area_ha, _ = validate_polygon(json.loads(profile.farm_boundary))
        db.session.add(Field(user_id=profile.user_id, name=DEFAULT_FIELD_NAME,
                             boundary=profile.farm_boundary, area_ha=area_ha))
        changed = True
    if changed:
        db.session.commit()


def init_db():
    db.create_all()
    ensure_schema()
    backfill_fields()
    seed()


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


PROFILE_KEYS = {  # db column -> request key
    "phone": "phone", "farm_name": "farmName", "state": "state", "district": "district",
    "primary_crop": "primaryCrop", "land_acres": "landAcres",
}


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

def get_or_create_profile(user):
    if user.profile is None:
        user.profile = FarmerProfile(user_id=user.id, field_id=f"FU-{user.id:04d}")
    return user.profile


def _boundary_payload(profile):
    boundary = json.loads(profile.farm_boundary) if profile and profile.farm_boundary else None
    area = None
    if boundary:
        _, area, _ = validate_polygon(boundary)
    return {"mapped": boundary is not None, "boundary": boundary, "areaHectares": area}


def _current_user():
    return db.session.get(User, int(get_jwt_identity()))


def _sync_primary_boundary(user):
    """Keep profile.farm_boundary equal to the first field's boundary (legacy single-boundary API)."""
    primary = user.fields[0] if user.fields else None
    if primary is None:
        return
    profile = get_or_create_profile(user)
    profile.farm_boundary = primary.boundary
    profile.boundary_updated_at = datetime.utcnow()


def _name_taken(user_id, name, exclude_id=None):
    q = Field.query.filter(Field.user_id == user_id, func.lower(Field.name) == name.lower())
    if exclude_id is not None:
        q = q.filter(Field.id != exclude_id)
    return q.first() is not None


def _read_boundary(data):
    boundary = data.get('boundary')
    if isinstance(boundary, dict) and boundary.get('type') == 'Feature':
        boundary = boundary.get('geometry')
    return validate_polygon(boundary)


@app.route('/farmer/mapping-status', methods=['GET'])
@jwt_required()
def mapping_status():
    user = _current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"mapped": user.mapping_complete})


@app.route('/farmer/farm-boundary', methods=['GET'])
@jwt_required()
def get_farm_boundary():
    user = _current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(_boundary_payload(user.profile))


@app.route('/farmer/farm-boundary', methods=['PUT'])
@jwt_required()
def save_farm_boundary():
    """Original single-boundary API. It edits the farmer's primary (first) field, creating it if needed."""
    user = _current_user()  # ownership comes from the JWT only; any user id in the body is ignored
    if not user:
        return jsonify({"error": "User not found"}), 404
    geometry, area_ha, err = _read_boundary(request.get_json(silent=True) or {})
    if err:
        return jsonify({"error": err}), 400
    if user.fields:
        primary = user.fields[0]
        primary.boundary, primary.area_ha = json.dumps(geometry), area_ha
    else:
        db.session.add(Field(user_id=user.id, name=DEFAULT_FIELD_NAME, boundary=json.dumps(geometry), area_ha=area_ha))
        db.session.flush()
        db.session.refresh(user)
    _sync_primary_boundary(user)
    db.session.commit()
    return jsonify({**_boundary_payload(user.profile), "user": user.to_dict()})


# ---- Fields (multiple mapped plots per farmer) ----

@app.route('/farmer/fields', methods=['GET'])
@jwt_required()
def list_fields():
    user = _current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"fields": user.to_dict()["fields"]})


@app.route('/farmer/fields', methods=['POST'])
@jwt_required()
def create_field():
    user = _current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    data = request.get_json(silent=True) or {}
    name = _clean_str(data.get('name'), 100)
    if not name:
        return jsonify({"error": "Give this field a name"}), 400
    geometry, area_ha, err = _read_boundary(data)
    if err:
        return jsonify({"error": err}), 400
    if len(user.fields) >= MAX_FIELDS_PER_FARMER:
        return jsonify({"error": f"You can save up to {MAX_FIELDS_PER_FARMER} fields"}), 400
    if _name_taken(user.id, name):
        return jsonify({"error": "You already have a field with this name"}), 409
    field = Field(user_id=user.id, name=name, boundary=json.dumps(geometry), area_ha=area_ha)
    db.session.add(field)
    try:
        db.session.flush()
        db.session.refresh(user)
        _sync_primary_boundary(user)  # only changes anything for the very first field
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "You already have a field with this name"}), 409
    return jsonify({"field": field.to_dict(is_primary=user.fields[0].id == field.id), "user": user.to_dict()}), 201


def _own_field(user, field_id):
    # Looked up by id AND owner, so another farmer's field is indistinguishable from a missing one.
    return Field.query.filter_by(id=field_id, user_id=user.id).first()


@app.route('/farmer/fields/<int:field_id>', methods=['GET'])
@jwt_required()
def get_field(field_id):
    user = _current_user()
    field = _own_field(user, field_id) if user else None
    if not field:
        return jsonify({"error": "Field not found"}), 404
    return jsonify({"field": field.to_dict(is_primary=user.fields[0].id == field.id)})


@app.route('/farmer/fields/<int:field_id>', methods=['PUT'])
@jwt_required()
def update_field(field_id):
    user = _current_user()
    field = _own_field(user, field_id) if user else None
    if not field:
        return jsonify({"error": "Field not found"}), 404
    data = request.get_json(silent=True) or {}
    if 'name' in data:
        name = _clean_str(data.get('name'), 100)
        if not name:
            return jsonify({"error": "Give this field a name"}), 400
        if _name_taken(user.id, name, exclude_id=field.id):
            return jsonify({"error": "You already have a field with this name"}), 409
        field.name = name
    if 'boundary' in data:
        geometry, area_ha, err = _read_boundary(data)
        if err:
            return jsonify({"error": err}), 400
        field.boundary, field.area_ha = json.dumps(geometry), area_ha
    if user.fields and user.fields[0].id == field.id:
        _sync_primary_boundary(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "You already have a field with this name"}), 409
    return jsonify({"field": field.to_dict(is_primary=user.fields[0].id == field.id), "user": user.to_dict()})


@app.route('/farmer/profile', methods=['GET'])
@jwt_required()
def get_profile():
    user = _current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"name": user.name, "email": user.email,
                    "profile": user.profile.to_dict() if user.profile else None})


@app.route('/farmer/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    """Partial update: only the keys present in the request change. `name` lives on the user row."""
    user = _current_user()
    if not user:
        return jsonify({"error": "User not found"}), 404
    data = request.get_json(silent=True) or {}
    if 'name' in data:
        name = _clean_str(data.get('name'), 100)
        if not name:
            return jsonify({"error": "Name cannot be empty"}), 400
        user.name = name
    fields, err = parse_profile(data)
    if err:
        return jsonify({"error": err}), 400
    profile = get_or_create_profile(user)
    for column, key in PROFILE_KEYS.items():
        if key in data:
            setattr(profile, column, fields[column])
    db.session.commit()
    return jsonify({"name": user.name, "profile": profile.to_dict(), "user": user.to_dict()})


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
        init_db()
    app.run(debug=False, port=5001)
