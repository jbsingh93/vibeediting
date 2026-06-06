import io, re
p = 'test-artifacts/scratch-v2/capabilities/_tests/p0.9-contract.test.ts'
s = io.open(p, encoding='utf-8', newline='').read()
pat = re.compile(r"fs\.appendFileSync\(envPath, '\r?\nVIBE_TEST_PRESENCE=not-a-secret\r?\n', 'utf8'\);")
ts_literal = "'" + chr(92) + "nVIBE_TEST_PRESENCE=not-a-secret" + chr(92) + "n'"
new = "fs.appendFileSync(envPath, " + ts_literal + ", 'utf8');"
s2, n = pat.subn(new, s)
assert n == 1, f'matched {n}'
io.open(p, 'w', encoding='utf-8', newline='').write(s2)
print('fixed scratch p0.9')
