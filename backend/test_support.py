"""
test_support.py — test-only configuration, imported FIRST by every test module (before forum_api).

It makes it impossible for a test run to reach a real database, even if DATABASE_URL (or
DATABASE_URL_DIRECT) is exported in your shell or defined in backend/.env:

  * DATABASE_URL is overwritten (never "set if missing") with a throwaway SQLite file.
  * DATABASE_URL_DIRECT is blanked, which also stops backend/.env from supplying it.
  * AGRISENSE_TESTING=1 switches on two guards in db_config.py: backend/.env is never loaded, and any
    non-SQLite database URL is refused outright.
"""
import os
import pathlib
import tempfile


def use_temp_sqlite():
    """Point this process at a new empty SQLite file. Returns the (closed) temp file object."""
    tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    tmp.close()
    os.environ['AGRISENSE_TESTING'] = '1'
    os.environ['DATABASE_URL'] = 'sqlite:///' + pathlib.Path(tmp.name).as_posix()
    os.environ['DATABASE_URL_DIRECT'] = ''
    os.environ['AGRISENSE_PG_DRIVER'] = 'psycopg'  # tests never connect; this just keeps URL tests machine-independent
    return tmp
