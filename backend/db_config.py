"""
db_config.py — database settings shared by forum_api.py, migrate_sqlite_to_postgres.py and
check_pooled_connection.py.

The database is chosen by the DATABASE_URL environment variable (or backend/.env).
With no DATABASE_URL the app keeps using the local SQLite file, exactly as before, but it never
falls back to SQLite *silently* when a hosted database was clearly meant (see ConfigError cases).
"""
import os
import sys
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

DEFAULT_URL = 'sqlite:///agri_forum.db'
LOCAL_HOSTS = {None, '', 'localhost', '127.0.0.1', '::1'}
ENV_FILE = Path(__file__).with_name('.env')
DEV_JWT_SECRET = 'dev-secret-change-in-production'  # public placeholder; fine for local SQLite only
MIN_JWT_SECRET_LENGTH = 32


class ConfigError(RuntimeError):
    """A configuration problem the user must fix. The message says how."""


def _testing():
    """Set by the test suites (test_support.py). In this mode no real database may be touched."""
    return os.environ.get('AGRISENSE_TESTING') == '1'


def exit_if_test_mode():
    """
    Called by the entry points (python forum_api.py, the migration and the pooled check).
    AGRISENSE_TESTING=1 makes the code ignore backend/.env, so if it ever leaked into a real shell the app
    would quietly lose its settings. Refuse to run instead.
    """
    if _testing():
        sys.exit('ERROR: AGRISENSE_TESTING=1 is set in this environment. It is only for the test suite '
                 '(it makes the app ignore backend/.env and refuse PostgreSQL). Unset it and run again:\n'
                 '  PowerShell:  Remove-Item Env:AGRISENSE_TESTING')


def load_env(path=None):
    """
    Load backend/.env. Variables already set in the environment win over the file.

    If the file exists but python-dotenv is not installed, raise instead of ignoring the file:
    ignoring it would silently drop DATABASE_URL and fall back to local SQLite.
    Returns True if a file was loaded. Test runs never read the real .env (an explicit path still works).
    """
    if path is None:
        if _testing():
            return False
        path = ENV_FILE
    path = Path(path)
    if not path.exists():
        return False
    try:
        from dotenv import load_dotenv
    except ImportError:
        raise ConfigError(
            f'{path} exists, but the python-dotenv package is not installed, so its settings '
            '(including DATABASE_URL) would be ignored and the app would silently fall back to local SQLite.\n'
            '  Install it with:  python -m pip install -r requirements_forum.txt\n'
            '  (or just:         python -m pip install python-dotenv)') from None
    load_dotenv(path)
    return True


def load_env_or_exit():
    try:
        load_env()
    except ConfigError as e:
        sys.exit(f'ERROR: {e}')


def parse_url(url, name='the database URL'):
    """make_url, but a malformed value becomes a ConfigError (the value itself is never echoed)."""
    try:
        return make_url(url)
    except ArgumentError:
        raise ConfigError(f'{name} is not a valid database URL (expected something like '
                          'postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require).') from None


_AUTO_DRIVER = []  # cache of the auto-detected driver (the explicit setting is never cached)


def pg_driver():
    """
    Which Python PostgreSQL driver to use.
      AGRISENSE_PG_DRIVER=psycopg | pg8000   forces one.
      otherwise psycopg 3 if it really imports, else pg8000.
    pg8000 is pure Python (no DLL), for machines where Windows Application Control blocks psycopg's compiled
    extension (psycopg_binary\\pq.*.pyd) and no libpq is installed. Both speak the same PostgreSQL protocol.
    """
    choice = os.environ.get('AGRISENSE_PG_DRIVER', '').strip().lower()
    if choice:
        if choice not in ('psycopg', 'pg8000'):
            raise ConfigError(f'AGRISENSE_PG_DRIVER must be "psycopg" or "pg8000", not "{choice}".')
        return choice
    if not _AUTO_DRIVER:
        try:
            import psycopg  # noqa: F401  (raises ImportError if its native part is blocked or missing)
            _AUTO_DRIVER.append('psycopg')
        except Exception:
            _AUTO_DRIVER.append('pg8000')
    return _AUTO_DRIVER[0]


def normalize_database_url(url):
    """
    Turn a provider URL into one SQLAlchemy can use:
      postgres://...      -> postgresql+<driver>://...      (driver: see pg_driver())
      postgresql://...    -> postgresql+<driver>://...
    and require TLS for any non-local PostgreSQL host (Neon only accepts TLS anyway).
      psycopg: sslmode=require is added to the URL.
      pg8000 : TLS is switched on in engine_options(); libpq-only URL options (sslmode, channel_binding) are
               removed because pg8000 does not understand them.
    URLs that name a driver explicitly, and SQLite URLs, are left alone.
    """
    url = (url or '').strip()
    if url.startswith('postgres://'):
        url = 'postgresql://' + url[len('postgres://'):]
    if url.startswith('postgresql://'):
        url = f'postgresql+{pg_driver()}://' + url[len('postgresql://'):]
    parsed = parse_url(url)
    if parsed.get_backend_name() == 'postgresql':
        if parsed.get_driver_name() == 'pg8000':
            if 'sslmode' in parsed.query or 'channel_binding' in parsed.query:
                parsed = parsed.difference_update_query(['sslmode', 'channel_binding'])
                url = parsed.render_as_string(hide_password=False)
        elif parsed.host not in LOCAL_HOSTS and 'sslmode' not in parsed.query:
            parsed = parsed.update_query_dict({'sslmode': 'require'})
            url = parsed.render_as_string(hide_password=False)
    return url


def refuse_remote_db_in_tests(url):
    """Safety net: while a test suite is running, anything other than a SQLite file is refused."""
    if _testing() and parse_url(url).get_backend_name() != 'sqlite':
        raise ConfigError('Refusing to use a non-SQLite database while tests are running '
                          '(AGRISENSE_TESTING=1). Tests must only ever use throwaway SQLite files.')


def check_url_pair(database_url, direct_url):
    """
    DATABASE_URL is the pooled connection used ONLY by the running app; DATABASE_URL_DIRECT is the direct
    connection used ONLY by the migration. Arguments are the raw settings (None or blank = not set).

    If a direct URL is configured, a hosted database is clearly intended, so the app must not start
    unless DATABASE_URL is a valid, *different* PostgreSQL URL (never blank, never SQLite).
    """
    direct = (direct_url or '').strip()
    if not direct:
        return
    parse_url(direct, 'DATABASE_URL_DIRECT')  # report a malformed value under its own name
    d = parse_url(normalize_database_url(direct), 'DATABASE_URL_DIRECT')
    if d.get_backend_name() != 'postgresql':
        raise ConfigError(f'DATABASE_URL_DIRECT must be a PostgreSQL URL, but it is {d.get_backend_name()}.')
    pooled = (database_url or '').strip()
    if not pooled:
        raise ConfigError(
            'DATABASE_URL_DIRECT is set but DATABASE_URL is empty, so the app would silently use local SQLite '
            'instead of your Neon database. Set DATABASE_URL to the pooled Neon connection string '
            '(or clear DATABASE_URL_DIRECT to use SQLite on purpose).')
    parse_url(pooled, 'DATABASE_URL')
    a = parse_url(normalize_database_url(pooled), 'DATABASE_URL')
    if a.get_backend_name() != 'postgresql':
        raise ConfigError(
            f'DATABASE_URL_DIRECT points at PostgreSQL but DATABASE_URL is a {a.get_backend_name()} URL, so the '
            'app would silently use that instead of your Neon database. Set DATABASE_URL to the pooled Neon '
            'connection string (or clear DATABASE_URL_DIRECT to use SQLite on purpose).')
    if (a.host, a.port, a.database, a.username) == (d.host, d.port, d.database, d.username):
        raise ConfigError(
            'DATABASE_URL and DATABASE_URL_DIRECT are the same connection. The running app must use the POOLED '
            'string (host contains "-pooler") in DATABASE_URL; the direct string belongs only in '
            'DATABASE_URL_DIRECT, for the migration.')


def get_database_url():
    explicit = os.environ.get('DATABASE_URL')
    check_url_pair(explicit, os.environ.get('DATABASE_URL_DIRECT'))
    if explicit:
        parse_url(explicit, 'DATABASE_URL')  # a malformed value is reported under its own name
    url = normalize_database_url(explicit or DEFAULT_URL)
    refuse_remote_db_in_tests(url)
    return url


def is_postgres(url):
    return parse_url(url).get_backend_name() == 'postgresql'


def mask_url(url):
    """URL that is safe to print (password hidden)."""
    return parse_url(url).render_as_string(hide_password=True)


def check_jwt_secret(database_url, secret):
    """
    With PostgreSQL the app is meant to be hosted, so login tokens must be signed with a real secret.
    SQLite (local development) keeps working with the built-in placeholder.
    """
    if not is_postgres(database_url):
        return
    value = (secret or '').strip()
    problem = None
    if not value:
        problem = 'JWT_SECRET_KEY is not set'
    elif value == DEV_JWT_SECRET:
        problem = 'JWT_SECRET_KEY is still the public development placeholder'
    elif len(value) < MIN_JWT_SECRET_LENGTH:
        problem = f'JWT_SECRET_KEY is too short (minimum {MIN_JWT_SECRET_LENGTH} characters)'
    if problem:
        raise ConfigError(
            f'{problem}. A PostgreSQL database is configured, and anyone who knows the signing secret can '
            'forge login tokens for any user.\n'
            '  Generate one:  python -c "import secrets; print(secrets.token_urlsafe(48))"\n'
            '  then put it in backend/.env as  JWT_SECRET_KEY=<the value>')


def engine_options(url):
    """
    Extra SQLAlchemy engine settings. Nothing for SQLite. For PostgreSQL on Neon:
      pool_pre_ping / pool_recycle  - Neon suspends idle databases and drops idle connections
      prepare_threshold=None        - no server-side prepared statements, which PgBouncer-style
                                      pooled connections (the "-pooler" host) can break
    """
    if not is_postgres(url):
        return {}
    parsed = parse_url(url)
    if parsed.get_driver_name() == 'pg8000':
        # TLS is mandatory for any non-local host (ssl_context=True: verified against the system CA store)
        connect_args = {'timeout': 15}
        if parsed.host not in LOCAL_HOSTS:
            connect_args['ssl_context'] = True
    else:
        connect_args = {'prepare_threshold': None, 'connect_timeout': 15}
    return {
        'pool_pre_ping': True,
        'pool_recycle': 280,
        'pool_size': 5,
        'max_overflow': 5,
        'connect_args': connect_args,
    }
