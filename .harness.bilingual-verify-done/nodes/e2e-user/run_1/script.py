"""
logex bilingual E2E verification — revised after Landing was reverted
Outcomes: sidebar/footer i18n + LangToggle (in nav) + console clean
"""
import json
import sys, os
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:5173'
VIEWPORT = {'width': 1280, 'height': 900}
FAKE_USER = {"user": {"login": "demo-user", "name": "Demo", "avatar": None}}
OUT_DIR = '/Users/touchskyer/Code/logex/.harness/nodes/e2e-user/run_1'
os.makedirs(OUT_DIR, exist_ok=True)

failures = []
console_errors = []
all_console = []

def check(cond, msg):
    if cond:
        print(f'  ✓ {msg}')
    else:
        print(f'  ✗ {msg}', file=sys.stderr)
        failures.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    def attach_console(page, label):
        def on_msg(msg):
            entry = {'label': label, 'type': msg.type, 'text': msg.text}
            all_console.append(entry)
            if msg.type == 'error':
                console_errors.append(entry)
        page.on('console', on_msg)
        page.on('pageerror', lambda err: console_errors.append(
            {'label': label, 'type': 'pageerror', 'text': str(err)}))

    # AUTHED tests — real coverage of i18n
    ctx = browser.new_context(viewport=VIEWPORT)
    ctx.route('**/api/auth/me', lambda r: r.fulfill(
        status=200, content_type='application/json', body=json.dumps(FAKE_USER)))

    for lang, expected in [
        ('en', {'nav': ['Articles', 'Timeline', 'Shares'],
                'logout': 'Logout',
                'footer_has': ['articles', 'from', 'session']}),
        ('zh', {'nav': ['文章', '时间线', '分享'],
                'logout': '退出',
                'footer_has': ['篇文章', '来自', 'session']}),
    ]:
        print(f'\n=== Logged-in [{lang}] ===')
        page = ctx.new_page()
        attach_console(page, f'loggedin-{lang}')
        page.goto(f'{BASE}/#/{lang}/', wait_until='domcontentloaded')
        page.wait_for_selector('.sidebar', timeout=10000)
        try:
            page.wait_for_function(
                "() => { const t = document.querySelector('.footer__text')?.textContent || ''; return !t.includes('Loading') && !t.includes('加载中'); }",
                timeout=8000,
            )
        except Exception:
            pass

        nav_texts = page.locator('.sidebar .sidebar__link-text').all_inner_texts()
        footer_text = page.locator('.footer__text').inner_text()
        logout_text = page.locator('.nav__logout').inner_text()

        for want in expected['nav']:
            check(want in nav_texts, f'OUT-4[{lang}] sidebar nav has "{want}" (got: {nav_texts})')
        check(logout_text.strip() == expected['logout'],
              f'OUT-4[{lang}] logout button == "{expected["logout"]}" (got: {logout_text!r})')
        for want in expected['footer_has']:
            check(want in footer_text,
                  f'OUT-5[{lang}] footer contains "{want}" (got: {footer_text!r})')

        # OUT-3: LangToggle in nav, aria-pressed matches url
        lang_buttons = page.locator('.nav .lang-toggle button')
        n = lang_buttons.count()
        check(n == 2, f'OUT-3[{lang}] LangToggle has 2 buttons (got {n})')
        if n == 2:
            zh_p = lang_buttons.nth(0).get_attribute('aria-pressed')
            en_p = lang_buttons.nth(1).get_attribute('aria-pressed')
            check(
                (lang == 'zh' and zh_p == 'true' and en_p == 'false') or
                (lang == 'en' and en_p == 'true' and zh_p == 'false'),
                f'OUT-3[{lang}] aria-pressed correct (zh={zh_p} en={en_p})'
            )

        page.screenshot(path=f'{OUT_DIR}/screenshot-loggedin-{lang}.png', full_page=True)
        print(f'  ↳ saved screenshot-loggedin-{lang}.png')
        page.close()

    ctx.close()

    # UNAUTH Landing — just prove it loads, since user reverted i18n-ization
    ctx_un = browser.new_context(viewport=VIEWPORT)
    ctx_un.route('**/api/auth/me', lambda r: r.fulfill(
        status=200, content_type='application/json', body=json.dumps({'user': None})))
    for lang, expected_title in [('en', 'Every AI session'), ('zh', '每一次 AI session')]:
        page = ctx_un.new_page()
        attach_console(page, f'landing-{lang}')
        page.goto(f'{BASE}/#/{lang}/', wait_until='domcontentloaded')
        page.wait_for_selector('.landing__title', timeout=10000)
        title = page.locator('.landing__title').inner_text()
        check(expected_title in title,
              f'OUT-1/2 landing[{lang}] title contains "{expected_title}" (got: {title!r})')
        page.screenshot(path=f'{OUT_DIR}/screenshot-landing-{lang}.png', full_page=True)
        page.close()
    ctx_un.close()

    browser.close()

# OUT-6: JS errors only, filter out expected 404 + stale HMR
print('\n=== Console errors ===')
js_errors = [e for e in console_errors
             if 'Failed to load resource' not in e['text']
             and 'status of 404' not in e['text']
             and '[vite] ' not in e['text']]
check(len(js_errors) == 0,
      f'OUT-6 zero JS/pageerror entries (got {len(js_errors)}: {js_errors})')
print(f'  (filtered {len(console_errors) - len(js_errors)} expected network/HMR entries)')

with open(f'{OUT_DIR}/console.log', 'w') as f:
    for e in all_console:
        f.write(json.dumps(e) + '\n')

print(f'\n=== Summary ===')
print(f'failures: {len(failures)}')
if failures:
    for f_ in failures:
        print(f'  - {f_}')
    sys.exit(1)
print('ALL OUTCOMES PASS')
