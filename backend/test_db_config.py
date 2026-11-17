"""
Tests for database configuration (URL normalisation, engine options, seeding, PostgreSQL DDL).
No database server is needed.

Run:  python -m unittest test_db_config -v
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

import test_support  # noqa: E402  (must be first: forces a throwaway SQLite database, see test_support.py)

_tmp = test_support.use_temp_sqlite()

import sqlalchemy as sa  # noqa: E402
from sqlalchemy.dialects import postgresql  # noqa: E402
from sqlalchemy.schema import CreateTable  # noqa: E402

import db_config  # noqa: E402
import forum_api  # noqa: E402

try:  # the driver may be absent, or present but blocked by the OS (e.g. an application-control policy)
    import psycopg  # noqa: F401
    HAS_PSYCOPG = True
except Exception:
    HAS_PSYCOPG = False


class UrlTests(unittest.TestCase):
    def test_provider_urls_become_psycopg3(self):
        for raw in ('postgres://u:p@ep-1-pooler.eu.aws.neon.invalid/db?sslmode=require',
                    'postgresql://u:p@ep-1-pooler.eu.aws.neon.invalid/db?sslmode=require'):
            self.assertTrue(db_config.normalize_database_url(raw).startswith('postgresql+psycopg://u:p@ep-1-pooler'))

    def test_tls_required_for_remote_hosts_only(self):
        remote = db_config.normalize_database_url('postgresql://u:p@ep-1.neon.invalid/db')
        self.assertIn('sslmode=require', remote)
        local = db_config.normalize_database_url('postgresql://u:p@localhost/db')
        self.assertNotIn('sslmode', local)
        explicit = db_config.normalize_database_url('postgresql://u:p@ep-1.neon.invalid/db?sslmode=verify-full')
        self.assertIn('sslmode=verify-full', explicit)
        self.assertNotIn('sslmode=require', explicit)

    def test_password_survives_normalisation(self):
        url = db_config.normalize_database_url('postgresql://user:p%40ss%2Fw0rd@ep-1.neon.invalid/db')
        self.assertEqual(sa.engine.make_url(url).password, 'p@ss/w0rd')

    def test_sqlite_and_explicit_drivers_untouched(self):
        self.assertEqual(db_config.normalize_database_url('sqlite:///agri_forum.db'), 'sqlite:///agri_forum.db')
        self.assertTrue(db_config.normalize_database_url('postgresql+psycopg2://u:p@h/db?sslmode=require')
                        .startswith('postgresql+psycopg2://'))

    def test_default_is_sqlite_when_unset(self):
        old = os.environ.pop('DATABASE_URL', None)
        try:
            self.assertEqual(db_config.get_database_url(), 'sqlite:///agri_forum.db')
            os.environ['DATABASE_URL'] = ''
            self.assertEqual(db_config.get_database_url(), 'sqlite:///agri_forum.db')  # blank .env value
        finally:
            if old is not None:
                os.environ['DATABASE_URL'] = old
            else:
                os.environ.pop('DATABASE_URL', None)

    def test_mask_hides_password(self):
        masked = db_config.mask_url('postgresql+psycopg://user:SuperSecret@ep-1.neon.invalid/db')
        self.assertNotIn('SuperSecret', masked)
        self.assertIn('user', masked)

    def test_engine_options(self):
        self.assertEqual(db_config.engine_options('sqlite:///x.db'), {})
        opts = db_config.engine_options('postgresql+psycopg://u:p@h/db')
        self.assertTrue(opts['pool_pre_ping'])
        self.assertLess(opts['pool_recycle'], 300)
        self.assertIsNone(opts['connect_args']['prepare_threshold'])

    @unittest.skipUnless(HAS_PSYCOPG, 'psycopg not installed')
    def test_postgres_engine_builds_without_connecting(self):
        url = db_config.normalize_database_url('postgresql://u:p@ep-1-pooler.neon.invalid/db')
        engine = sa.create_engine(url, **db_config.engine_options(url))
        self.assertEqual(engine.dialect.name, 'postgresql')
        self.assertEqual(engine.dialect.driver, 'psycopg')


class Pg8000DriverTests(unittest.TestCase):
    """pure-Python driver, used when Windows Application Control blocks psycopg's compiled extension"""

    def setUp(self):
        patcher = mock.patch.dict(os.environ, {'AGRISENSE_PG_DRIVER': 'pg8000'})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_urls_use_pg8000_and_libpq_only_options_are_removed(self):
        url = db_config.normalize_database_url(
            'postgresql://u:p%40w@ep-1-pooler.neon.invalid/db?sslmode=require&channel_binding=require')
        parsed = sa.engine.make_url(url)
        self.assertEqual(parsed.drivername, 'postgresql+pg8000')
        self.assertEqual(parsed.password, 'p@w')
        self.assertEqual(dict(parsed.query), {})

    def test_tls_is_switched_on_for_remote_hosts_only(self):
        remote = db_config.engine_options(db_config.normalize_database_url('postgresql://u:p@ep-1.neon.invalid/db'))
        self.assertIs(remote['connect_args']['ssl_context'], True)
        self.assertNotIn('prepare_threshold', remote['connect_args'])
        self.assertTrue(remote['pool_pre_ping'])
        local = db_config.engine_options(db_config.normalize_database_url('postgresql://u:p@localhost/db'))
        self.assertNotIn('ssl_context', local['connect_args'])

    def test_engine_builds_without_connecting(self):
        url = db_config.normalize_database_url('postgresql://u:p@ep-1-pooler.neon.invalid/db')
        engine = sa.create_engine(url, **db_config.engine_options(url))
        self.assertEqual(engine.dialect.driver, 'pg8000')

    def test_unknown_driver_name_is_refused(self):
        with mock.patch.dict(os.environ, {'AGRISENSE_PG_DRIVER': 'nope'}):
            with self.assertRaises(db_config.ConfigError):
                db_config.pg_driver()

    def test_without_an_override_a_blocked_psycopg_falls_back_to_pg8000(self):
        env = {k: v for k, v in os.environ.items() if k != 'AGRISENSE_PG_DRIVER'}
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(db_config, '_AUTO_DRIVER', []), \
                mock.patch.dict(sys.modules, {'psycopg': None}):  # None makes "import psycopg" raise ImportError
            self.assertEqual(db_config.pg_driver(), 'pg8000')


class SchemaTests(unittest.TestCase):
    def test_every_table_compiles_for_postgresql(self):
        pg = postgresql.dialect()
        for table in forum_api.db.metadata.sorted_tables:
            ddl = str(CreateTable(table).compile(dialect=pg))
            self.assertNotIn('DATETIME', ddl, table.name)  # not a PostgreSQL type
        user_ddl = str(CreateTable(forum_api.db.metadata.tables['user']).compile(dialect=pg))
        like_ddl = str(CreateTable(forum_api.db.metadata.tables['like']).compile(dialect=pg))
        self.assertIn('CREATE TABLE "user"', user_ddl)  # reserved words are quoted
        self.assertIn('CREATE TABLE "like"', like_ddl)
        self.assertIn('SERIAL', user_ddl)

    def test_upgrade_column_types_render_per_dialect(self):
        for dialect, expected in ((sa.dialects.sqlite.dialect(), 'DATETIME'),
                                  (postgresql.dialect(), 'TIMESTAMP WITHOUT TIME ZONE')):
            self.assertEqual(forum_api.db.DateTime().compile(dialect=dialect), expected)
            self.assertEqual(forum_api.db.Text().compile(dialect=dialect), 'TEXT')


class SeedTests(unittest.TestCase):
    def setUp(self):
        self._old = os.environ.pop('SEED_DEMO_DATA', None)

    def tearDown(self):
        os.environ.pop('SEED_DEMO_DATA', None)
        if self._old is not None:
            os.environ['SEED_DEMO_DATA'] = self._old

    def test_demo_seed_default_follows_database_type(self):
        with forum_api.app.app_context():
            self.assertEqual(forum_api.db.engine.dialect.name, 'sqlite')
            self.assertTrue(forum_api.demo_seed_enabled())  # local SQLite keeps the old behaviour

    def test_flag_overrides_default(self):
        with forum_api.app.app_context():
            for value, expected in (('0', False), ('false', False), ('1', True), ('yes', True)):
                os.environ['SEED_DEMO_DATA'] = value
                self.assertEqual(forum_api.demo_seed_enabled(), expected, value)

    def test_demo_user_not_created_when_disabled_but_categories_are(self):
        script = '\n'.join([
            "import json, forum_api as f",
            "with f.app.app_context():",
            "    f.init_db()",
            "    print(json.dumps([f.Category.query.count(), f.User.query.count(), f.Post.query.count()]))",
        ])
        here = os.path.dirname(os.path.abspath(__file__))
        for flag, expected in (('0', [8, 0, 0]), ('1', [8, 1, 2])):
            with tempfile.TemporaryDirectory() as d:
                env = {**os.environ, 'SEED_DEMO_DATA': flag,
                       'DATABASE_URL': 'sqlite:///' + os.path.join(d, 'x.db').replace(os.sep, '/')}
                out = subprocess.run([sys.executable, '-W', 'ignore', '-c', script], cwd=here, env=env,
                                     capture_output=True, text=True)
                self.assertEqual(out.returncode, 0, out.stderr)
                self.assertEqual(json.loads(out.stdout.strip().splitlines()[-1]), expected, f'SEED_DEMO_DATA={flag}')


HERE = os.path.dirname(os.path.abspath(__file__))


class LoadEnvTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.env_file = os.path.join(self.tmp.name, '.env')

    def write_env(self):
        with open(self.env_file, 'w') as f:
            f.write('DATABASE_URL=postgresql://u:TopSecret@ep-1.neon.invalid/db\n')

    def test_no_env_file_is_fine_even_without_dotenv(self):
        with mock.patch.dict(sys.modules, {'dotenv': None}):
            self.assertFalse(db_config.load_env(self.env_file))

    def test_env_file_without_dotenv_fails_loudly_with_install_instructions(self):
        self.write_env()
        with mock.patch.dict(sys.modules, {'dotenv': None}):  # makes "from dotenv import ..." raise ImportError
            with self.assertRaises(db_config.ConfigError) as cm:
                db_config.load_env(self.env_file)
        msg = str(cm.exception)
        self.assertIn('pip install', msg)
        self.assertIn('python-dotenv', msg)
        self.assertIn('requirements_forum.txt', msg)
        self.assertIn('SQLite', msg)
        self.assertIn(self.env_file, msg)
        self.assertNotIn('TopSecret', msg)  # the file's contents are never echoed

    def test_env_file_is_loaded_when_dotenv_is_installed(self):
        self.write_env()
        calls = []
        fake = types.ModuleType('dotenv')
        fake.load_dotenv = lambda p: calls.append(str(p))
        with mock.patch.dict(sys.modules, {'dotenv': fake}):
            self.assertTrue(db_config.load_env(self.env_file))
        self.assertEqual(calls, [self.env_file])

    def test_real_env_file_is_never_read_while_tests_run(self):
        self.write_env()
        with mock.patch.object(db_config, 'ENV_FILE', pathlib.Path(self.env_file)):
            with mock.patch.dict(sys.modules, {'dotenv': None}):
                self.assertFalse(db_config.load_env())  # AGRISENSE_TESTING=1: skipped, not even an error

    def test_default_env_file_is_checked_outside_tests(self):
        self.write_env()
        with mock.patch.object(db_config, 'ENV_FILE', pathlib.Path(self.env_file)), \
                mock.patch.dict(os.environ, {'AGRISENSE_TESTING': ''}), \
                mock.patch.dict(sys.modules, {'dotenv': None}):
            with self.assertRaises(db_config.ConfigError):
                db_config.load_env()
            with self.assertRaises(SystemExit) as cm:  # what forum_api.py / the scripts do at startup
                db_config.load_env_or_exit()
        self.assertIn('python-dotenv', str(cm.exception.code))


class NoSilentSqliteFallbackTests(unittest.TestCase):
    def test_direct_url_without_pooled_url_is_an_error(self):
        env = {'DATABASE_URL': '', 'DATABASE_URL_DIRECT': 'postgresql://u:TopSecret@ep.neon.invalid/db'}
        with mock.patch.dict(os.environ, env):
            with self.assertRaisesRegex(db_config.ConfigError, 'DATABASE_URL is empty') as cm:
                db_config.get_database_url()
        self.assertNotIn('TopSecret', str(cm.exception))

    def test_nothing_configured_is_plain_sqlite(self):
        with mock.patch.dict(os.environ, {'DATABASE_URL': '', 'DATABASE_URL_DIRECT': ''}):
            self.assertEqual(db_config.get_database_url(), 'sqlite:///agri_forum.db')


POOLED = 'postgresql://u:TopSecret@ep-1-pooler.eu.aws.neon.invalid/neondb?sslmode=require'
DIRECT = 'postgresql://u:TopSecret@ep-1.eu.aws.neon.invalid/neondb?sslmode=require'


class UrlPairTests(unittest.TestCase):
    """DATABASE_URL = pooled, for the running app only. DATABASE_URL_DIRECT = direct, for the migration only."""

    def assert_refused(self, app_url, direct_url, text):
        with self.assertRaisesRegex(db_config.ConfigError, text) as cm:
            db_config.check_url_pair(app_url, direct_url)
        self.assertNotIn('TopSecret', str(cm.exception))  # never echoes credentials

    def test_no_direct_url_means_no_constraint(self):
        for app_url in (None, '', 'sqlite:///agri_forum.db', POOLED):
            for direct in (None, '', '   '):
                db_config.check_url_pair(app_url, direct)

    def test_blank_pooled_url_with_a_direct_url_is_refused(self):
        for blank in (None, '', '   '):
            self.assert_refused(blank, DIRECT, 'DATABASE_URL is empty')

    def test_sqlite_pooled_url_with_a_postgres_direct_url_is_refused(self):
        self.assert_refused('sqlite:///agri_forum.db', DIRECT, 'DATABASE_URL is a sqlite URL')
        self.assert_refused('sqlite:///' + 'C:/some/other.db', DIRECT, 'silently use')

    def test_non_postgres_pooled_url_is_refused(self):
        self.assert_refused('mysql://u:TopSecret@h/db', DIRECT, 'mysql')

    def test_valid_distinct_postgres_pair_is_accepted(self):
        db_config.check_url_pair(POOLED, DIRECT)
        db_config.check_url_pair(POOLED.replace('postgresql://', 'postgres://'), DIRECT)

    def test_app_may_not_use_the_direct_connection(self):
        self.assert_refused(DIRECT, DIRECT, 'same connection')
        # same endpoint written differently (scheme, query string) is still the same connection
        self.assert_refused(DIRECT.replace('postgresql://', 'postgres://').split('?')[0], DIRECT, 'same connection')
        self.assert_refused(DIRECT.replace('postgresql://', 'postgresql+psycopg://'), DIRECT, 'same connection')

    def test_direct_url_must_itself_be_postgres(self):
        self.assert_refused(POOLED, 'sqlite:///x.db', 'DATABASE_URL_DIRECT must be a PostgreSQL URL')
        self.assert_refused(POOLED, 'mysql://u:TopSecret@h/db', 'DATABASE_URL_DIRECT must be a PostgreSQL URL')

    def test_malformed_urls_become_clear_errors_without_echoing_them(self):
        self.assert_refused(POOLED, 'this is not a url TopSecret', 'DATABASE_URL_DIRECT is not a valid database URL')
        self.assert_refused('also not a url TopSecret', DIRECT, 'DATABASE_URL is not a valid database URL')
        with mock.patch.dict(os.environ, {'DATABASE_URL': 'garbage TopSecret', 'DATABASE_URL_DIRECT': ''}):
            with self.assertRaisesRegex(db_config.ConfigError, 'not a valid database URL') as cm:
                db_config.get_database_url()
        self.assertNotIn('TopSecret', str(cm.exception))

    def test_get_database_url_enforces_the_pair_rule(self):
        cases = (({'DATABASE_URL': '', 'DATABASE_URL_DIRECT': DIRECT}, 'DATABASE_URL is empty'),
                 ({'DATABASE_URL': 'sqlite:///x.db', 'DATABASE_URL_DIRECT': DIRECT}, 'sqlite URL'),
                 ({'DATABASE_URL': DIRECT, 'DATABASE_URL_DIRECT': DIRECT}, 'same connection'))
        for env, text in cases:
            with mock.patch.dict(os.environ, env):
                with self.assertRaisesRegex(db_config.ConfigError, text):
                    db_config.get_database_url()


class TestModeGuardTests(unittest.TestCase):
    def test_entry_points_refuse_to_run_with_the_test_flag_set(self):
        with self.assertRaises(SystemExit) as cm:  # AGRISENSE_TESTING=1 is set in this process
            db_config.exit_if_test_mode()
        self.assertIn('AGRISENSE_TESTING', str(cm.exception.code))
        self.assertIn('Remove-Item Env:AGRISENSE_TESTING', str(cm.exception.code))

    def test_entry_points_run_normally_without_the_flag(self):
        with mock.patch.dict(os.environ, {'AGRISENSE_TESTING': ''}):
            self.assertIsNone(db_config.exit_if_test_mode())


class TestIsolationTests(unittest.TestCase):
    def test_this_process_is_pinned_to_a_throwaway_sqlite_file(self):
        self.assertEqual(os.environ['AGRISENSE_TESTING'], '1')
        self.assertTrue(os.environ['DATABASE_URL'].startswith('sqlite:///'))
        self.assertEqual(os.environ['DATABASE_URL_DIRECT'], '')

    def test_any_postgres_url_is_refused_while_tests_run(self):
        for url in ('postgresql://u:TopSecret@ep-1.neon.invalid/db', 'postgres://u:p@ep-1-pooler.neon.invalid/db',
                    'postgresql+psycopg://u:p@localhost/db', 'mysql://u:p@h/db'):
            with mock.patch.dict(os.environ, {'DATABASE_URL': url}):
                with self.assertRaisesRegex(db_config.ConfigError, 'non-SQLite') as cm:
                    db_config.get_database_url()
            self.assertNotIn('TopSecret', str(cm.exception))

    def test_guard_is_off_outside_tests(self):
        with mock.patch.dict(os.environ, {'AGRISENSE_TESTING': '', 'DATABASE_URL': 'postgresql://u:p@ep-1.neon.invalid/db'}):
            self.assertTrue(db_config.get_database_url().startswith('postgresql+psycopg://'))

    def test_exported_shell_variables_cannot_leak_into_a_test_process(self):
        # A fresh interpreter started with a real-looking DATABASE_URL still ends up on SQLite once
        # test_support has run, and the pooled Neon URL is gone.
        script = chr(10).join([
            "import os, test_support",
            "test_support.use_temp_sqlite()",
            "import forum_api",
            "print(forum_api.DATABASE_URL.split(':')[0], repr(os.environ['DATABASE_URL_DIRECT']))",
        ])
        env = {**os.environ, 'DATABASE_URL': 'postgresql://u:TopSecret@ep-1-pooler.neon.invalid/db',
               'DATABASE_URL_DIRECT': 'postgresql://u:TopSecret@ep-1.neon.invalid/db'}
        out = subprocess.run([sys.executable, '-W', 'ignore', '-c', script], cwd=HERE, env=env, capture_output=True, text=True)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip().splitlines()[-1], "sqlite ''")


class JwtSecretTests(unittest.TestCase):
    PG = 'postgresql+psycopg://u:p@ep-1.neon.invalid/db'
    STRONG = 'k3J9-' * 10  # 50 characters

    def test_postgres_requires_a_real_secret(self):
        for bad, expected in ((None, 'not set'), ('', 'not set'), ('   ', 'not set'),
                              (db_config.DEV_JWT_SECRET, 'placeholder'), ('  ' + db_config.DEV_JWT_SECRET + ' ', 'placeholder'),
                              ('short-secret', 'too short'), ('x' * 31, 'too short')):
            with self.assertRaisesRegex(db_config.ConfigError, expected, msg=repr(bad)) as cm:
                db_config.check_jwt_secret(self.PG, bad)
            self.assertIn('secrets.token_urlsafe', str(cm.exception))  # tells the user how to fix it
            self.assertIn('backend/.env', str(cm.exception))

    def test_postgres_accepts_a_strong_secret(self):
        db_config.check_jwt_secret(self.PG, self.STRONG)
        db_config.check_jwt_secret(self.PG, 'x' * 32)

    def test_sqlite_development_behaviour_is_unchanged(self):
        for secret in (None, '', db_config.DEV_JWT_SECRET, 'short'):
            db_config.check_jwt_secret('sqlite:///agri_forum.db', secret)


class StartupGuardTests(unittest.TestCase):
    """forum_api.py must stop at import time (before any connection) when the configuration is unsafe."""

    def run_import(self, env_overrides, testing=False):
        script = chr(10).join([
            "import db_config, pathlib",
            "db_config.ENV_FILE = pathlib.Path('no-such-file.env')  # never read a real backend/.env here",
            "import forum_api",
            "print('IMPORTED', forum_api.app.config['JWT_SECRET_KEY'])",
        ])
        env = {k: v for k, v in os.environ.items() if k != 'AGRISENSE_TESTING'}
        if testing:
            env['AGRISENSE_TESTING'] = '1'
        env.update(env_overrides)
        return subprocess.run([sys.executable, '-W', 'ignore', '-c', script], cwd=HERE, env=env, capture_output=True, text=True)

    def assert_refused(self, result, text):
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('ERROR:', result.stderr)
        self.assertIn(text, result.stderr)
        self.assertNotIn('IMPORTED', result.stdout)
        self.assertNotIn('TopSecret', result.stdout + result.stderr)

    PG = 'postgresql://u:TopSecret@ep-1-pooler.neon.invalid/db'

    def test_postgres_without_secret_stops_startup(self):
        self.assert_refused(self.run_import({'DATABASE_URL': self.PG, 'DATABASE_URL_DIRECT': '', 'JWT_SECRET_KEY': ''}),
                            'JWT_SECRET_KEY is not set')

    def test_postgres_with_placeholder_secret_stops_startup(self):
        self.assert_refused(self.run_import({'DATABASE_URL': self.PG, 'DATABASE_URL_DIRECT': '',
                                             'JWT_SECRET_KEY': db_config.DEV_JWT_SECRET}), 'placeholder')

    def test_postgres_with_short_secret_stops_startup(self):
        self.assert_refused(self.run_import({'DATABASE_URL': self.PG, 'DATABASE_URL_DIRECT': '', 'JWT_SECRET_KEY': 'abc'}),
                            'too short')

    def test_direct_url_without_pooled_url_stops_startup(self):
        self.assert_refused(self.run_import({'DATABASE_URL': '', 'JWT_SECRET_KEY': '',
                                             'DATABASE_URL_DIRECT': 'postgresql://u:TopSecret@ep-1.neon.invalid/db'}),
                            'DATABASE_URL is empty')

    def test_direct_url_with_sqlite_pooled_url_stops_startup(self):
        self.assert_refused(self.run_import({'DATABASE_URL': 'sqlite:///dev.db', 'JWT_SECRET_KEY': 'x' * 48,
                                             'DATABASE_URL_DIRECT': DIRECT}), 'DATABASE_URL is a sqlite URL')

    def test_app_configured_with_the_direct_url_stops_startup(self):
        self.assert_refused(self.run_import({'DATABASE_URL': DIRECT, 'JWT_SECRET_KEY': 'x' * 48,
                                             'DATABASE_URL_DIRECT': DIRECT}), 'same connection')

    def test_garbage_database_url_stops_startup_without_echoing_it(self):
        self.assert_refused(self.run_import({'DATABASE_URL': 'not a url TopSecret', 'DATABASE_URL_DIRECT': '',
                                             'JWT_SECRET_KEY': ''}), 'not a valid database URL')

    def test_a_valid_pooled_and_direct_pair_passes_the_url_checks(self):
        # the next check in line (the JWT secret) is the one that stops it, proving the pair itself was accepted
        self.assert_refused(self.run_import({'DATABASE_URL': POOLED, 'DATABASE_URL_DIRECT': DIRECT, 'JWT_SECRET_KEY': ''}),
                            'JWT_SECRET_KEY is not set')

    def test_sqlite_development_still_starts_without_a_secret(self):
        with tempfile.TemporaryDirectory() as d:
            url = 'sqlite:///' + os.path.join(d, 'dev.db').replace(os.sep, '/')
            for secret in ('', db_config.DEV_JWT_SECRET):
                out = self.run_import({'DATABASE_URL': url, 'DATABASE_URL_DIRECT': '', 'JWT_SECRET_KEY': secret}, testing=True)
                self.assertEqual(out.returncode, 0, out.stderr)
                # a blank value (e.g. copied from .env.example) must not become an empty signing key
                self.assertEqual(out.stdout.split()[-1], db_config.DEV_JWT_SECRET)


if __name__ == '__main__':
    unittest.main()
