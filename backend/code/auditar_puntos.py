"""Audita si hay facturas ELEGIBLES que nunca recibieron puntos.

Replica la regla del nodo `Filtro Natural` del workflow b3NqLczq5MzJ3dmb y cruza
contra puntos_log. Una factura elegible sin registro en el log = puntos perdidos
(la factura quedo marcada como procesada y el workflow nunca reintenta).
"""
import urllib.request, json, time, re, math
from collections import defaultdict

CUTOFF = '2026-05-11'
BLOCKED = {'222222222222', '7777777777777'}
LAURA = re.compile(r'laura\s+catalina\s+le[oó]n', re.I)
KW = re.compile(r'\b(s\.?a\.?s\.?|ltda\.?|factura|corp|inc|empresa|group|grupo|distribu|comercial|industria|hospitality|retail|inversiones)\b', re.I)

auth = json.loads(urllib.request.urlopen(urllib.request.Request(
    'https://api.siigo.com/auth',
    data=json.dumps({'username': 'facturacioncacaobasico@gmail.com',
                     'access_key': 'YmUxM2E0MGMtYmFkYi00MmYwLWFkMzktODBlNmRhNmMzYzBhOm94ISk4Mns3RFo='}).encode(),
    headers={'Content-Type': 'application/json', 'Partner-Id': 'n8nApp'}, method='POST'), timeout=25).read())
SH = {'Authorization': 'Bearer ' + auth['access_token'], 'Partner-Id': 'n8nApp'}


def get(u, tries=6):
    for i in range(tries):
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=SH), timeout=60).read())
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(4)


# 1) Facturas desde el corte
base = f'https://api.siigo.com/v1/invoices?date_start={CUTOFF}&date_end=2026-12-31'
tot = get(base + '&page=1&page_size=1')['pagination']['total_results']
inv = []
for pg in range(1, tot // 100 + 2):
    inv += get(base + f'&page={pg}&page_size=100').get('results', [])
print(f'facturas desde {CUTOFF}: {len(inv)}')

# 2) Catalogo de clientes (para person_type / id_type / nombre)
cust = {}
c1 = get('https://api.siigo.com/v1/customers?page=1&page_size=1')
ctot = c1['pagination']['total_results']
for pg in range(1, ctot // 100 + 2):
    for c in get(f'https://api.siigo.com/v1/customers?page={pg}&page_size=100').get('results', []):
        cust[str(c.get('identification', '')).strip()] = c
print(f'clientes en catalogo: {len(cust)}')


def elegible(i):
    if Number(i.get('cost_center')) != 168:
        return False, 'cc != 168'
    ident = str((i.get('customer') or {}).get('identification') or '').strip()
    if ident in BLOCKED:
        return False, 'generico'
    if str(i.get('date') or '')[:10] < CUTOFF:
        return False, 'antes del corte'
    c = cust.get(ident, {})
    if str(c.get('person_type') or '') == 'Company':
        return False, 'Company'
    if str(((c.get('id_type') or {}).get('code')) or '') == '31':
        return False, 'id_type 31 (NIT)'
    nm = c.get('name') or (i.get('customer') or {}).get('name')
    nm = ' '.join(nm) if isinstance(nm, list) else str(nm or '')
    if LAURA.search(nm):
        return False, 'Laura Catalina Leon'
    if KW.search(nm):
        return False, 'nombre de empresa'
    return True, ''


def Number(x):
    try:
        return int(x)
    except Exception:
        return -1


def isub(i):
    t = 0.0
    for it in (i.get('items') or []):
        b = float(it.get('price') or 0) * float(it.get('quantity') or 1)
        d = it.get('discount')
        dv = float(d.get('value') or 0) if isinstance(d, dict) else (float(d) if d else 0)
        t += b - dv
    return t


eleg = []
for i in inv:
    ok, _ = elegible(i)
    if ok:
        eleg.append(i)
print(f'ELEGIBLES para puntos: {len(eleg)}')

# 3) puntos_log
SB = 'https://wavqyesyqqmawjfaztvb.supabase.co'
SR = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhdnF5ZXN5cXFtYXdqZmF6dHZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDEyNzMzNywiZXhwIjoyMDk5NzAzMzM3fQ.2CfyDo0-NgKOy32ghmztOcVQIaJ-3eTuBpxyoyNMjGw'
H = {'apikey': SR, 'Authorization': 'Bearer ' + SR}
logs = []
off = 0
while True:
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        SB + f'/rest/v1/puntos_log?select=invoice_id,points,tipo,fecha,contact_name&limit=1000&offset={off}',
        headers=H), timeout=60).read())
    logs += r
    if len(r) < 1000:
        break
    off += 1000
logueadas = {str(l.get('invoice_id') or '').strip() for l in logs if l.get('tipo') == 'suma_puntos'}
print(f'registros en puntos_log: {len(logs)} | facturas con suma_puntos: {len(logueadas)}')

# 4) Cruce
faltan = [i for i in eleg if str(i.get('name') or '').strip() not in logueadas]
print()
print('=' * 72)
if not faltan:
    print('>>> TODAS LAS FACTURAS ELEGIBLES TIENEN SUS PUNTOS. Nada pendiente.')
else:
    print(f'>>> {len(faltan)} FACTURA(S) ELEGIBLE(S) SIN PUNTOS:')
    tp = 0
    for i in sorted(faltan, key=lambda x: x.get('date') or ''):
        cu = i.get('customer') or {}
        s = isub(i)
        p = math.ceil(s / 1000)
        tp += p
        c = cust.get(str(cu.get('identification') or '').strip(), {})
        nm = c.get('name') or cu.get('name')
        nm = ' '.join(nm) if isinstance(nm, list) else str(nm or '')
        print(f"   {i.get('name'):<14} {i.get('date')} doc={str(cu.get('identification')):<14} "
              f"sub={s:>12,.2f} pts={p:>4}  {nm[:30]}")
    print(f'   TOTAL puntos no otorgados: {tp}')
