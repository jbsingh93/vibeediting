import io
for root in ('template', 'test-artifacts/scratch-v2'):
    p = f'{root}/capabilities/_tests/p0.9-contract.test.ts'
    s = io.open(p, encoding='utf-8', newline='').read()
    broken = "fs.appendFileSync(envPath, '\nVIBE_TEST_PRESENCE=not-a-secret\n', 'utf8');"
    fixed = "fs.appendFileSync(envPath, " + repr('\nVIBE_TEST_PRESENCE=not-a-secret\n')[1:-1].join(["'", "'"]) + ", 'utf8');"
    # build the TS literal explicitly: '\nVIBE_TEST_PRESENCE=not-a-secret\n'
    ts_literal = "'" + chr(92) + "nVIBE_TEST_PRESENCE=not-a-secret" + chr(92) + "n'"
    fixed = "fs.appendFileSync(envPath, " + ts_literal + ", 'utf8');"
    assert broken in s, p
    s = s.replace(broken, fixed)
    io.open(p, 'w', encoding='utf-8', newline='').write(s)
    print('fixed', p)
