"""
Tests for multiple fields per farmer, name/profile persistence and the field backfill migration.
Uses throwaway SQLite files only.

Run:  python -m unittest test_fields -v
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

HERE = os.path.dirname(os.path.abspath(__file__))


def square(lon, lat, size=0.001):
    r = lambda v: round(v, 7)  # the server stores 7 decimals
    return {"type": "Polygon", "coordinates": [[
        [r(lon), r(lat)], [r(lon + size), r(lat)], [r(lon + size), r(lat + size)], [r(lon), r(lat + size)], [r(lon), r(lat)]]]}


A1, A2, A3 = square(74.90, 19.43), square(74.92, 19.43), square(74.94, 19.43)


class FieldTests(unittest.TestCase):
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

    def register(self, email, name="Test Farmer", **extra):
        r = self.client.post('/auth/register', json={"name": name, "email": email, "password": "secret1", **extra})
        self.assertEqual(r.status_code, 201, r.get_json())
        return r.get_json()

    def h(self, token):
        return {"Authorization": f"Bearer {token}"}

    def add(self, token, name, boundary):
        return self.client.post('/farmer/fields', headers=self.h(token), json={"name": name, "boundary": boundary})

    def me(self, token):
        return self.client.get('/auth/me', headers=self.h(token)).get_json()

    # ---- fields ----
    def test_new_farmer_has_no_fields_then_adds_several(self):
        reg = self.register("multi@example.com")
        t = reg["token"]
        self.assertEqual(reg["user"]["fields"], [])
        self.assertFalse(reg["user"]["mappingComplete"])

        r1 = self.add(t, "North plot", A1)
        self.assertEqual(r1.status_code, 201, r1.get_json())
        self.assertTrue(r1.get_json()["field"]["isPrimary"])
        self.assertTrue(r1.get_json()["user"]["mappingComplete"])
        r2 = self.add(t, "River field", A2)
        self.assertEqual(r2.status_code, 201)
        self.assertFalse(r2.get_json()["field"]["isPrimary"])
        self.assertGreater(r2.get_json()["field"]["areaHectares"], 0)

        me = self.me(t)
        self.assertEqual([f["name"] for f in me["fields"]], ["North plot", "River field"])
        # the original single-boundary value still equals the FIRST field and is not overwritten by the second
        self.assertEqual(me["profile"]["farmBoundary"]["coordinates"], me["fields"][0]["boundary"]["coordinates"])
        legacy = self.client.get('/farmer/farm-boundary', headers=self.h(t)).get_json()
        self.assertEqual(legacy["boundary"]["coordinates"], A1["coordinates"])

    def test_edit_field_does_not_duplicate_and_mirrors_primary_only(self):
        t = self.register("edit@example.com")["token"]
        f1 = self.add(t, "One", A1).get_json()["field"]
        f2 = self.add(t, "Two", A2).get_json()["field"]

        r = self.client.put(f'/farmer/fields/{f2["id"]}', headers=self.h(t), json={"name": "Two renamed", "boundary": A3})
        self.assertEqual(r.status_code, 200, r.get_json())
        me = self.me(t)
        self.assertEqual(len(me["fields"]), 2)  # no duplicate
        self.assertEqual(me["fields"][1]["name"], "Two renamed")
        self.assertEqual(me["profile"]["farmBoundary"]["coordinates"], A1["coordinates"])  # primary untouched

        new_a = square(75.0, 19.5)
        self.client.put(f'/farmer/fields/{f1["id"]}', headers=self.h(t), json={"boundary": new_a})
        me = self.me(t)
        self.assertEqual(me["profile"]["farmBoundary"]["coordinates"], new_a["coordinates"])  # primary mirrored
        # saving a field under its own current name is not a conflict
        self.assertEqual(self.client.put(f'/farmer/fields/{f1["id"]}', headers=self.h(t), json={"name": "One"}).status_code, 200)

    def test_duplicate_names_and_validation(self):
        t = self.register("fields-dup@example.com")["token"]
        self.assertEqual(self.add(t, "Plot", A1).status_code, 201)
        self.assertEqual(self.add(t, "  plot ", A2).status_code, 409)  # case-insensitive, trimmed
        self.assertEqual(self.add(t, "", A2).status_code, 400)
        self.assertEqual(self.add(t, "Bad", {"type": "Polygon", "coordinates": []}).status_code, 400)
        bowtie = {"type": "Polygon", "coordinates": [[[74.9, 19.4], [74.91, 19.41], [74.91, 19.4], [74.9, 19.41], [74.9, 19.4]]]}
        self.assertEqual(self.add(t, "Bowtie", bowtie).status_code, 400)
        self.assertEqual(len(self.me(t)["fields"]), 1)
        two = self.add(t, "Other", A2).get_json()["field"]
        self.assertEqual(self.client.put(f'/farmer/fields/{two["id"]}', headers=self.h(t), json={"name": "PLOT"}).status_code, 409)

    def test_field_limit(self):
        t = self.register("limit@example.com")["token"]
        for i in range(forum_api.MAX_FIELDS_PER_FARMER):
            self.assertEqual(self.add(t, f"F{i}", square(70 + i * 0.01, 20)).status_code, 201)
        self.assertEqual(self.add(t, "One too many", square(80, 20)).status_code, 400)

    def test_ownership_isolation(self):
        a = self.register("own-a@example.com")
        b = self.register("own-b@example.com")
        fa = self.add(a["token"], "A field", A1).get_json()["field"]
        self.add(b["token"], "B field", A2)

        # B cannot read or modify A's field, by id; the response is the same as for a missing id
        self.assertEqual(self.client.get(f'/farmer/fields/{fa["id"]}', headers=self.h(b["token"])).status_code, 404)
        r = self.client.put(f'/farmer/fields/{fa["id"]}', headers=self.h(b["token"]),
                            json={"name": "hijacked", "boundary": A3, "userId": a["user"]["id"]})
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.client.get('/farmer/fields/99999', headers=self.h(b["token"])).status_code, 404)
        # B's list only has B's field; A's data unchanged
        self.assertEqual([f["name"] for f in self.client.get('/farmer/fields', headers=self.h(b["token"])).get_json()["fields"]], ["B field"])
        mine = self.client.get(f'/farmer/fields/{fa["id"]}', headers=self.h(a["token"])).get_json()["field"]
        self.assertEqual((mine["name"], mine["boundary"]["coordinates"]), ("A field", A1["coordinates"]))
        # the same name is allowed for different farmers
        self.assertEqual(self.add(b["token"], "A field", A3).status_code, 201)
        # a client-supplied userId when creating is ignored
        c = self.add(b["token"], "Sneaky", square(76, 20))
        self.assertEqual(len(self.me(a["token"])["fields"]), 1)
        self.assertEqual(c.status_code, 201)

    def test_requires_authentication(self):
        for method, path in (('get', '/farmer/fields'), ('post', '/farmer/fields'),
                             ('get', '/farmer/fields/1'), ('put', '/farmer/fields/1')):
            self.assertEqual(getattr(self.client, method)(path).status_code, 401, path)

    def test_legacy_single_boundary_api_creates_and_updates_primary_field(self):
        t = self.register("legacy@example.com")["token"]
        self.client.put('/farmer/farm-boundary', headers=self.h(t), json={"boundary": A1})
        me = self.me(t)
        self.assertEqual([f["name"] for f in me["fields"]], ["Main field"])
        self.client.put('/farmer/farm-boundary', headers=self.h(t), json={"boundary": A2})
        me = self.me(t)
        self.assertEqual(len(me["fields"]), 1)
        self.assertEqual(me["fields"][0]["boundary"]["coordinates"], A2["coordinates"])

    def test_profile_less_user_can_create_field(self):
        r = self.client.post('/auth/login', json={"email": "arjun@agrovista.in", "password": "farm@123"}).get_json()
        self.assertIsNone(r["user"]["profile"])
        c = self.add(r["token"], "First field", A1)
        self.assertEqual(c.status_code, 201)
        self.assertTrue(c.get_json()["user"]["profile"]["fieldId"].startswith("FU-"))

    # ---- name + profile persistence ----
    def test_name_is_saved_at_registration_and_returned_everywhere(self):
        reg = self.register("name@example.com", name="  Suresh Kumar Yadav  ", farmName="Yadav Farm", phone="9876543210")
        self.assertEqual(reg["user"]["name"], "Suresh Kumar Yadav")
        t = reg["token"]
        self.assertEqual(self.me(t)["name"], "Suresh Kumar Yadav")
        self.assertEqual(self.client.get('/farmer/profile', headers=self.h(t)).get_json()["name"], "Suresh Kumar Yadav")
        login = self.client.post('/auth/login', json={"email": "name@example.com", "password": "secret1"}).get_json()
        self.assertEqual(login["user"]["name"], "Suresh Kumar Yadav")
        with forum_api.app.app_context():
            row = forum_api.User.query.filter_by(email="name@example.com").first()
            self.assertEqual(row.name, "Suresh Kumar Yadav")
            self.assertEqual(row.profile.user_id, row.id)

    def test_profile_update_persists_and_is_partial(self):
        t = self.register("upd2@example.com", name="Old Name", farmName="Farm A", phone="9876543210",
                          state="Gujarat", district="Surat", primaryCrop="Cotton", landAcres=4)["token"]
        r = self.client.put('/farmer/profile', headers=self.h(t), json={"name": "New Name"})
        self.assertEqual(r.status_code, 200)
        r = self.client.put('/farmer/profile', headers=self.h(t), json={"farmName": "Farm B"})
        p = r.get_json()["profile"]
        # keys that were not sent are NOT erased
        self.assertEqual((p["farmName"], p["phone"], p["state"], p["district"], p["primaryCrop"], p["landAcres"]),
                         ("Farm B", "9876543210", "Gujarat", "Surat", "Cotton", 4.0))
        login = self.client.post('/auth/login', json={"email": "upd2@example.com", "password": "secret1"}).get_json()["user"]
        self.assertEqual((login["name"], login["profile"]["farmName"]), ("New Name", "Farm B"))
        # a key sent as empty clears it, on request
        self.client.put('/farmer/profile', headers=self.h(t), json={"phone": ""})
        self.assertIsNone(self.me(t)["profile"]["phone"])

    def test_blank_name_rejected_and_existing_name_kept(self):
        t = self.register("blank@example.com", name="Keep Me")["token"]
        for bad in ("", "   ", None):
            self.assertEqual(self.client.put('/farmer/profile', headers=self.h(t), json={"name": bad}).status_code, 400)
        self.assertEqual(self.me(t)["name"], "Keep Me")
        self.assertEqual(self.client.put('/farmer/profile', headers=self.h(t), json={"phone": "bad!"}).status_code, 400)

    def test_user_with_blank_name_can_repair_it(self):
        reg = self.register("repair@example.com", name="Temp")
        with forum_api.app.app_context():  # simulate a legacy row with an empty name
            forum_api.User.query.filter_by(email="repair@example.com").first().name = ""
            forum_api.db.session.commit()
        self.assertEqual(self.me(reg["token"])["name"], "")
        r = self.client.put('/farmer/profile', headers=self.h(reg["token"]), json={"name": "Repaired Name"})
        self.assertEqual(r.get_json()["user"]["name"], "Repaired Name")


class FieldBackfillMigrationTests(unittest.TestCase):
    def test_existing_boundaries_become_main_field_once(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'old.db')
            boundary = json.dumps(A1)
            con = sqlite3.connect(path)
            con.executescript(f"""
                CREATE TABLE user (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL, role VARCHAR(20), created_at DATETIME);
                CREATE TABLE farmer_profile (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE, phone VARCHAR(20),
                    farm_name VARCHAR(120), state VARCHAR(60), district VARCHAR(80), primary_crop VARCHAR(60),
                    land_acres FLOAT, field_id VARCHAR(40) UNIQUE, farm_boundary TEXT, boundary_updated_at DATETIME,
                    created_at DATETIME, updated_at DATETIME, FOREIGN KEY(user_id) REFERENCES user (id));
                INSERT INTO user (id, name, email, password_hash, role) VALUES (1, 'Mapped Farmer', 'm@example.com', 'x', 'user');
                INSERT INTO user (id, name, email, password_hash, role) VALUES (2, 'Unmapped Farmer', 'u@example.com', 'x', 'user');
                INSERT INTO farmer_profile (user_id, farm_name, field_id, farm_boundary) VALUES (1, 'Farm M', 'FU-0001', '{boundary}');
                INSERT INTO farmer_profile (user_id, farm_name, field_id) VALUES (2, 'Farm U', 'FU-0002');
            """)
            con.commit()
            con.close()
            script = (
                "import json, forum_api as f\n"
                "out = []\n"
                "with f.app.app_context():\n"
                "    for _ in range(3): f.init_db()  # repeatable\n"
                "    for e in ('m@example.com', 'u@example.com'):\n"
                "        u = f.User.query.filter_by(email=e).first()\n"
                "        out.append({'email': e, 'fields': [x.name for x in u.fields], 'mapped': u.mapping_complete,\n"
                "                    'area': u.fields[0].area_ha if u.fields else None, 'farm': u.profile.farm_name})\n"
                "print(json.dumps(out))\n"
            )
            env = {**os.environ, 'DATABASE_URL': 'sqlite:///' + pathlib.Path(path).as_posix()}
            res = subprocess.run([sys.executable, '-W', 'ignore', '-c', script], cwd=HERE, env=env, capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, res.stderr)
            mapped, unmapped = json.loads(res.stdout.strip().splitlines()[-1])
            self.assertEqual(mapped["fields"], ["Main field"])  # exactly one, even after 3 runs
            self.assertTrue(mapped["mapped"])
            self.assertGreater(mapped["area"], 0)
            self.assertEqual(unmapped["fields"], [])
            self.assertFalse(unmapped["mapped"])
            self.assertEqual((mapped["farm"], unmapped["farm"]), ("Farm M", "Farm U"))  # profiles intact
            con = sqlite3.connect(path)
            try:
                kept = con.execute("select farm_boundary from farmer_profile where user_id=1").fetchone()[0]
            finally:
                con.close()
            self.assertEqual(kept, boundary)  # original boundary column untouched


if __name__ == '__main__':
    unittest.main()
