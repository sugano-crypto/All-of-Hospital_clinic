"""Check reachability of all eight official bureau source pages.

Preflight only: does not download spreadsheets, interpret institution rows,
or change Supabase. Supports network diagnostics on Codex and GitHub Actions.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ALLOWED_HOSTS = {'kouseikyoku.mhlw.go.jp', 'www.mhlw.go.jp'}
SOURCES_PATH = Path(__file__).with_name('sources.json')


def validate_url(url):
    parts = urlsplit(url)
    if parts.scheme != 'https' or parts.hostname not in ALLOWED_HOSTS:
        raise ValueError(f'Unofficial URL blocked: {url}')


class OfficialRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def check(url, timeout=12):
    validate_url(url)
    try:
        req = Request(url, headers={'User-Agent': 'NationalMedicalFacilitySearch/0.1 preflight'})
        with build_opener(OfficialRedirect()).open(req, timeout=timeout) as res:
            res.read(256)
            return {'accessible': True, 'status': res.status, 'final_url': res.url,
                    'content_type': res.headers.get('Content-Type', '')}
    except HTTPError as e:
        return {'accessible': False, 'status': e.code, 'error': f'HTTP {e.code}: {e.reason}'}
    except (URLError, OSError, TimeoutError, ValueError) as e:
        return {'accessible': False, 'status': None, 'error': f'{type(e).__name__}: {e}'}


def run(sources, checker=check):
    tasks = [(s['id'], s['name'], kind, s[kind]) for s in sources for kind in ('facilities', 'filings')]
    urls = list(dict.fromkeys(task[3] for task in tasks))
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(checker, urls))
    indexed = dict(zip(urls, results))
    rows = [dict(bureau_id=bureau_id, bureau=name, category=kind, url=url, **indexed[url])
            for bureau_id, name, kind, url in tasks]
    return {
        'tested_at_utc': datetime.now(timezone.utc).isoformat(),
        'scope': 'official source landing pages only (not Excel/ZIP or semantic full coverage)',
        'project': 'sugano-crypto/All-of-Hospital_clinic',
        'supabase_project_id': 'leczxapskgixlzykdovz',
        'pages_tested': len(rows),
        'unique_urls_tested': len(urls),
        'bureaus_tested': len({row['bureau_id'] for row in rows}),
        'all_pages_accessible': all(row['accessible'] for row in rows),
        'pages': rows,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='work/source-preflight.json')
    parser.add_argument('--timeout', type=int, default=12)
    args = parser.parse_args()
    sources = json.loads(SOURCES_PATH.read_text(encoding='utf-8'))
    report = run(sources, checker=lambda url: check(url, timeout=args.timeout))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    for entry in report['pages']:
        status = f"HTTP {entry['status']}" if entry['status'] else entry.get('error', 'failure')
        print(f"{entry['bureau']}: {entry['category']}: {status}")
    print('saved:', output)
    print('NOTE: page success is NOT complete Excel/ZIP acquisition.')
    return 0 if report['all_pages_accessible'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
