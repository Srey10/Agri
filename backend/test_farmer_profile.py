"""
Tests for farmer registration/profile endpoints. Uses a throwaway SQLite file,
never backend/instance/agri_forum.db.

Run:  python -m unittest test_farmer_profile -v
"""
import os
import pathlib
import tempfile
import unittest

_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
os.environ['DATABASE_URL'] = 'sqlite:///' + pathlib.Path(_tmp.name).as_posix()

import forum_api  # noqa: E402  (must come after DATABASE_URL is set)

PROFILE_A = {"name": "Ravi Patil", "email": "Ravi@Example.com", "password": "secret1",
             "phone": "+91 98765 43210", "farmName": "Ravi Orchards", "state": "Maharashtra",
             "district": "Nashik", "primaryCrop": "Banana (केला)", "landAcres": "5.5"}
PROFILE_B = {"name": "Gurpreet Singh", "email": "gurpreet@example.com", "password": "secret2",
             "farmName": "Singh Fields", "state": "Punjab", "district": "Ludhiana",
             "primaryCrop": "Wheat (गेहूं)", "landAcres": 12}


class FarmerProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with forum_api.app.app_context():
            forum_api.db.create_all()
            forum_api.seed()
        cls.client = forum_api.app.test_client()

    @classmethod
    def tearDownClass(cls):
        with forum_api.app.app_context():
            forum_api.db.session.remove()
            forum_api.db.engine.dispose()
        os.unlink(_tmp.name)

    def register(self, payload):
        return self.client.post('/auth/register', json=payload)

    def auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def test_register_persists_profile_and_login_returns_it(self):
        r = self.register(PROFILE_A)
        self.assertEqual(r.status_code, 201, r.get_json())
        user = r.get_json()["user"]
        self.assertEqual(user["email"], "ravi@example.com")
        self.assertEqual(user["profile"]["farmName"], "Ravi Orchards")
        self.assertEqual(user["profile"]["landAcres"], 5.5)
        self.assertEqual(user["profile"]["fieldId"], f"FU-{user['id']:04d}")

        login = self.client.post('/auth/login', json={"email": "RAVI@example.com", "password": "secret1"})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.get_json()["user"]["profile"], user["profile"])

    def test_different_farmers_get_different_profiles(self):
        ta = self.register({**PROFILE_A, "email": "a2@example.com"}).get_json()["token"]
        tb = self.register(PROFILE_B).get_json()["token"]
        pa = self.client.get('/auth/me', headers=self.auth(ta)).get_json()
        pb = self.client.get('/auth/me', headers=self.auth(tb)).get_json()
        self.assertEqual(pa["profile"]["farmName"], "Ravi Orchards")
        self.assertEqual(pb["profile"]["farmName"], "Singh Fields")
        self.assertNotEqual(pa["id"], pb["id"])
        self.assertNotEqual(pa["profile"]["fieldId"], pb["profile"]["fieldId"])

    def test_password_is_hashed(self):
        self.register({**PROFILE_A, "email": "hash@example.com"})
        with forum_api.app.app_context():
            u = forum_api.User.query.filter_by(email="hash@example.com").first()
            self.assertNotEqual(u.password_hash, "secret1")
            self.assertTrue(u.password_hash.startswith(("scrypt:", "pbkdf2:")))

    def test_profile_endpoint_uses_token_identity_only(self):
        ta = self.register({**PROFILE_A, "email": "own1@example.com"}).get_json()["token"]
        self.register({**PROFILE_B, "email": "own2@example.com"})
        # a client-supplied userId must be ignored
        r = self.client.put('/farmer/profile', headers=self.auth(ta),
                            json={"userId": 1, "user_id": 1, "farmName": "Renamed"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["profile"]["farmName"], "Renamed")
        with forum_api.app.app_context():
            other = forum_api.User.query.filter_by(email="own2@example.com").first()
            self.assertEqual(other.profile.farm_name, "Singh Fields")
        self.assertEqual(self.client.get('/farmer/profile').status_code, 401)

    def test_validation_and_duplicates(self):
        bad = [{**PROFILE_A, "email": "x@example.com", "password": "123"},
               {**PROFILE_A, "email": "not-an-email"},
               {**PROFILE_A, "email": "y@example.com", "landAcres": "abc"},
               {**PROFILE_A, "email": "z@example.com", "landAcres": -3},
               {**PROFILE_A, "email": "w@example.com", "phone": "hello"},
               {"email": "q@example.com"}]
        for payload in bad:
            self.assertEqual(self.register(payload).status_code, 400, payload)
        self.assertEqual(self.register({**PROFILE_A, "email": "dup@example.com"}).status_code, 201)
        self.assertEqual(self.register({**PROFILE_A, "email": "DUP@example.com"}).status_code, 409)
        with forum_api.app.app_context():  # failed registrations leave nothing behind
            self.assertEqual(forum_api.User.query.filter_by(email="x@example.com").count(), 0)

    def test_login_rejects_bad_credentials(self):
        self.register({**PROFILE_A, "email": "login@example.com"})
        for body in ({"email": "login@example.com", "password": "wrong"},
                     {"email": "nobody@example.com", "password": "secret1"},
                     {"email": None, "password": None}, {}):
            self.assertEqual(self.client.post('/auth/login', json=body).status_code, 401)

    def test_legacy_user_without_profile(self):
        r = self.client.post('/auth/login', json={"email": "arjun@agrovista.in", "password": "farm@123"})
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.get_json()["user"]["profile"])
        token = r.get_json()["token"]
        self.assertIsNone(self.client.get('/farmer/profile', headers=self.auth(token)).get_json()["profile"])

    def test_forum_still_linked_to_same_user_id(self):
        reg = self.register({**PROFILE_A, "email": "forum@example.com"}).get_json()
        r = self.client.post('/forum/posts', headers=self.auth(reg["token"]),
                             json={"title": "t", "content": "c", "categoryId": "general"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.get_json()["authorId"], reg["user"]["id"])
        self.assertEqual(r.get_json()["authorName"], "Ravi Patil")
        self.assertEqual(self.client.get('/forum/posts').status_code, 200)


if __name__ == '__main__':
    unittest.main()
