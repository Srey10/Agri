"""
Tests for farm boundary mapping: geometry validation, endpoints, ownership
isolation, mapping status and migration safety. Uses throwaway SQLite files only.

Run:  python -m unittest test_farm_boundary -v
"""
import json
import os
import pathlib
import sqlite3
import subprocess
import sys
import tempfile
import unittest

_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
os.environ['DATABASE_URL'] = 'sqlite:///' + pathlib.Path(_tmp.name).as_posix()

import forum_api  # noqa: E402
from farm_geometry import validate_polygon  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))

SQUARE = {"type": "Polygon", "coordinates": [[
    [74.9000, 19.4300], [74.9010, 19.4300], [74.9010, 19.4310], [74.9000, 19.4310], [74.9000, 19.4300]]]}
TRIANGLE = {"type": "Polygon", "coordinates": [[[74.90, 19.43], [74.91, 19.43], [74.905, 19.44]]]}  # unclosed
BOWTIE = {"type": "Polygon", "coordinates": [[
    [74.90, 19.43], [74.91, 19.44], [74.91, 19.43], [74.90, 19.44], [74.90, 19.43]]]}


class GeometryTests(unittest.TestCase):
    def test_square_area_and_closure(self):
        geom, ha, err = validate_polygon(SQUARE)
        self.assertIsNone(err)
        self.assertAlmostEqual(ha, 1.1, delta=0.15)  # ~105 m x ~111 m
        self.assertEqual(geom["coordinates"][0][0], geom["coordinates"][0][-1])

    def test_unclosed_ring_is_closed(self):
        geom, _, err = validate_polygon(TRIANGLE)
        self.assertIsNone(err)
        self.assertEqual(len(geom["coordinates"][0]), 4)

    def test_irregular_polygon_accepted(self):
        concave = {"type": "Polygon", "coordinates": [[
            [74.90, 19.43], [74.92, 19.43], [74.92, 19.45], [74.91, 19.44], [74.90, 19.45]]]}
        self.assertIsNone(validate_polygon(concave)[2])

    def test_rejects_invalid(self):
        bad = [
            None, {}, "x", {"type": "Point", "coordinates": [1, 2]},
            {"type": "Polygon", "coordinates": []},
            {"type": "Polygon", "coordinates": [[]]},
            {"type": "Polygon", "coordinates": [[[74.9, 19.4], [74.9, 19.4], [74.91, 19.4]]]},  # 2 distinct
            {"type": "Polygon", "coordinates": [[[74.9, 19.4], [74.91, 19.4], [74.92, 19.4]]]},  # collinear
            {"type": "Polygon", "coordinates": [[[200, 19.4], [74.9, 19.4], [74.9, 19.5]]]},     # lon range
            {"type": "Polygon", "coordinates": [[[74.9, 91], [74.9, 19.4], [74.91, 19.5]]]},     # lat range
            {"type": "Polygon", "coordinates": [[["a", 1], [2, 3], [4, 5]]]},
            {"type": "Polygon", "coordinates": [[[float('nan'), 1], [2, 3], [4, 5]]]},
            {"type": "Polygon", "coordinates": [SQUARE["coordinates"][0], SQUARE["coordinates"][0]]},  # hole
            BOWTIE,
        ]
        for geom in bad:
            self.assertIsNotNone(validate_polygon(geom)[2], geom)

    def test_too_many_vertices(self):
        ring = [[74.9 + i * 1e-6, 19.4 + (i % 2) * 1e-6] for i in range(600)]
        self.assertIsNotNone(validate_polygon({"type": "Polygon", "coordinates": [ring]})[2])

    def test_unrealistically_large(self):
        huge = {"type": "Polygon", "coordinates": [[[70, 10], [80, 10], [80, 20], [70, 20], [70, 10]]]}
        self.assertIsNotNone(validate_polygon(huge)[2])


class BoundaryApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with forum_api.app.app_context():
            forum_api.init_db()
        cls.client = forum_api.app.test_client()

    @classmethod
    def tearDownClass(cls):
        with forum_api.app.app_context():
            forum_api.db.session.remove()
            forum_api.db.engine.dispose()
        os.unlink(_tmp.name)

    def register(self, email, **extra):
        r = self.client.post('/auth/register', json={
            "name": "Farmer", "email": email, "password": "secret1", "farmName": email, "state": "Gujarat", **extra})
        self.assertEqual(r.status_code, 201, r.get_json())
        return r.get_json()

    def h(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_new_farmer_unmapped_then_mapped(self):
        reg = self.register("new@example.com")
        self.assertFalse(reg["user"]["mappingComplete"])
        t = reg["token"]
        self.assertFalse(self.client.get('/farmer/mapping-status', headers=self.h(t)).get_json()["mapped"])
        got = self.client.get('/farmer/farm-boundary', headers=self.h(t)).get_json()
        self.assertEqual((got["mapped"], got["boundary"]), (False, None))

        r = self.client.put('/farmer/farm-boundary', headers=self.h(t), json={"boundary": SQUARE})
        self.assertEqual(r.status_code, 200, r.get_json())
        self.assertTrue(r.get_json()["user"]["mappingComplete"])
        self.assertGreater(r.get_json()["areaHectares"], 0)

        self.assertTrue(self.client.get('/farmer/mapping-status', headers=self.h(t)).get_json()["mapped"])
        got = self.client.get('/farmer/farm-boundary', headers=self.h(t)).get_json()
        self.assertEqual(got["boundary"]["coordinates"][0][0], got["boundary"]["coordinates"][0][-1])
        # persists through login and keeps the rest of the profile
        login = self.client.post('/auth/login', json={"email": "new@example.com", "password": "secret1"}).get_json()
        self.assertTrue(login["user"]["mappingComplete"])
        self.assertEqual(login["user"]["profile"]["state"], "Gujarat")
        self.assertEqual(login["user"]["profile"]["farmBoundary"], got["boundary"])

    def test_update_replaces_boundary(self):
        t = self.register("upd@example.com")["token"]
        self.client.put('/farmer/farm-boundary', headers=self.h(t), json={"boundary": SQUARE})
        self.client.put('/farmer/farm-boundary', headers=self.h(t), json={"boundary": TRIANGLE})
        got = self.client.get('/farmer/farm-boundary', headers=self.h(t)).get_json()
        self.assertEqual(len(got["boundary"]["coordinates"][0]), 4)

    def test_accepts_geojson_feature(self):
        t = self.register("feat@example.com")["token"]
        r = self.client.put('/farmer/farm-boundary', headers=self.h(t),
                            json={"boundary": {"type": "Feature", "properties": {}, "geometry": SQUARE}})
        self.assertEqual(r.status_code, 200)

    def test_invalid_geometry_rejected_and_not_saved(self):
        t = self.register("inv@example.com")["token"]
        for body in ({}, {"boundary": None}, {"boundary": BOWTIE}, {"boundary": {"type": "Polygon", "coordinates": []}}):
            self.assertEqual(self.client.put('/farmer/farm-boundary', headers=self.h(t), json=body).status_code, 400)
        self.assertFalse(self.client.get('/farmer/mapping-status', headers=self.h(t)).get_json()["mapped"])

    def test_requires_authentication(self):
        for method, path in (('get', '/farmer/farm-boundary'), ('put', '/farmer/farm-boundary'),
                             ('get', '/farmer/mapping-status')):
            self.assertEqual(getattr(self.client, method)(path).status_code, 401)
        bad = {"Authorization": "Bearer not-a-token"}
        self.assertIn(self.client.get('/farmer/farm-boundary', headers=bad).status_code, (401, 422))

    def test_ownership_isolation(self):
        a = self.register("iso-a@example.com")
        b = self.register("iso-b@example.com")
        self.client.put('/farmer/farm-boundary', headers=self.h(a["token"]), json={"boundary": SQUARE})
        # B sends A's id: it must be ignored and B's own record modified
        self.client.put('/farmer/farm-boundary', headers=self.h(b["token"]),
                        json={"boundary": TRIANGLE, "userId": a["user"]["id"], "user_id": a["user"]["id"]})
        ga = self.client.get('/farmer/farm-boundary', headers=self.h(a["token"])).get_json()["boundary"]
        gb = self.client.get('/farmer/farm-boundary', headers=self.h(b["token"])).get_json()["boundary"]
        self.assertEqual(len(ga["coordinates"][0]), 5)
        self.assertEqual(len(gb["coordinates"][0]), 4)

    def test_existing_farmer_without_boundary_and_profile_less_user(self):
        # legacy seeded admin has no profile at all
        r = self.client.post('/auth/login', json={"email": "arjun@agrovista.in", "password": "farm@123"}).get_json()
        self.assertIsNone(r["user"]["profile"])
        self.assertFalse(r["user"]["mappingComplete"])
        put = self.client.put('/farmer/farm-boundary', headers=self.h(r["token"]), json={"boundary": SQUARE})
        self.assertEqual(put.status_code, 200)
        self.assertTrue(put.get_json()["user"]["mappingComplete"])
        self.assertTrue(put.get_json()["user"]["profile"]["fieldId"].startswith("FU-"))

    def test_profile_update_does_not_erase_boundary(self):
        t = self.register("keep@example.com")["token"]
        self.client.put('/farmer/farm-boundary', headers=self.h(t), json={"boundary": SQUARE})
        self.client.put('/farmer/profile', headers=self.h(t), json={"farmName": "Renamed"})
        self.assertTrue(self.client.get('/farmer/mapping-status', headers=self.h(t)).get_json()["mapped"])


class MigrationTests(unittest.TestCase):
    """Old-schema DB (farmer_profile without boundary columns) must upgrade in place, keeping data."""

    def test_old_schema_upgrades_without_data_loss(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'old.db')
            con = sqlite3.connect(path)
            con.executescript("""
                CREATE TABLE user (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL, role VARCHAR(20), created_at DATETIME);
                CREATE TABLE farmer_profile (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE, phone VARCHAR(20),
                    farm_name VARCHAR(120), state VARCHAR(60), district VARCHAR(80), primary_crop VARCHAR(60),
                    land_acres FLOAT, field_id VARCHAR(40) UNIQUE, created_at DATETIME, updated_at DATETIME,
                    FOREIGN KEY(user_id) REFERENCES user (id));
                INSERT INTO user (id, name, email, password_hash, role) VALUES (7, 'Old Farmer', 'old@example.com', 'x', 'user');
                INSERT INTO farmer_profile (id, user_id, farm_name, state, land_acres, field_id)
                    VALUES (1, 7, 'Old Farm', 'Punjab', 4.5, 'FU-0007');
            """)
            con.commit()
            con.close()
            script = (
                "import json, forum_api as f\n"
                "with f.app.app_context():\n"
                "    f.init_db(); f.init_db()  # twice: must be idempotent\n"
                "    u = f.User.query.filter_by(email='old@example.com').first()\n"
                "    print(json.dumps({'farm': u.profile.farm_name, 'acres': u.profile.land_acres,\n"
                "                      'mapped': u.to_dict()['mappingComplete'], 'users': f.User.query.count()}))\n"
            )
            env = {**os.environ, 'DATABASE_URL': 'sqlite:///' + pathlib.Path(path).as_posix()}
            out = subprocess.run([sys.executable, '-W', 'ignore', '-c', script], cwd=HERE, env=env,
                                 capture_output=True, text=True)
            self.assertEqual(out.returncode, 0, out.stderr)
            result = json.loads(out.stdout.strip().splitlines()[-1])
            self.assertEqual(result["farm"], "Old Farm")
            self.assertEqual(result["acres"], 4.5)
            self.assertFalse(result["mapped"])
            self.assertEqual(result["users"], 2)  # original + seeded demo admin
            con = sqlite3.connect(path)
            try:
                cols = {r[1] for r in con.execute("PRAGMA table_info(farmer_profile)")}
            finally:
                con.close()
            self.assertTrue({"farm_boundary", "boundary_updated_at"} <= cols)


if __name__ == '__main__':
    unittest.main()
