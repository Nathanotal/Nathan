"""Marginal-gain experiments (cheap, from cached data):
  1. Does a physically-correct daylight denominator N (sun above an elevation
     threshold, matching how sunshine recorders work) reduce systematic error?
  2. Wikipedia internal consistency: do the 12 monthly values sum to the stated
     annual? Flag transcription errors.
"""
import json, math, re, numpy as np
from pathlib import Path
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import GroupKFold

root = Path(__file__).resolve().parent
data = json.loads((root / ".." / "static" / "sunshine.json").read_text())
prog = json.loads((root / ".cache" / "power-progress.json").read_text())
MID = [15,46,74,105,135,166,196,227,258,288,319,349]
DPM = [31,28.25,31,30,31,30,31,31,30,31,30,31]

def decl(N):
    g = 2*math.pi/365*(N-1)
    return (0.006918-0.399912*math.cos(g)+0.070257*math.sin(g)-0.006758*math.cos(2*g)
            +0.000907*math.sin(2*g)-0.002697*math.cos(3*g)+0.00148*math.sin(3*g))
def daylight(lat,N,h0deg):
    la=math.radians(lat); d=decl(N); h0=math.radians(h0deg)
    c=(math.sin(h0)-math.sin(la)*math.sin(d))/(math.cos(la)*math.cos(d))
    return 24.0 if c<=-1 else 0.0 if c>=1 else 24/math.pi*math.acos(c)

# ---- 1. daylight-threshold sweep -------------------------------------------
base=[]
for i in range(data["n"]):
    p=prog.get(f"{data['lat'][i]},{data['lon'][i]}")
    if not p: continue
    for m in range(12):
        w=data["sun"][i][m]; a=p["all"][m]; clr=p["clr"][m]; toa=p["toa"][m]; cld=p.get("cld",[None]*12)[m]
        if None in (w,a,clr,toa,cld) or toa<0.3 or clr<0.3: continue
        base.append((i,data["lat"][i],m,w,a/toa,min(1,a/clr),cld/100))

def cv_for_threshold(h0):
    rows=[r for r in base if daylight(r[1],MID[r[2]],h0)>=1]
    X=np.array([[kt,cf,ca] for (_,_,_,_,kt,cf,ca) in rows])
    N=np.array([daylight(la,MID[m],h0) for (_,la,m,_,_,_,_) in rows])
    wiki=np.array([w for (_,_,_,w,_,_,_) in rows])
    grp=np.array([r[0] for r in rows])
    y=wiki/N
    oof=np.zeros(len(rows))
    for tr,te in GroupKFold(5).split(X,y,grp):
        mdl=LinearRegression().fit(X[tr],y[tr]); oof[te]=mdl.predict(X[te])
    h=np.clip(oof,0,1)*N; e=h-wiki
    return np.abs(e).mean(), math.sqrt((e**2).mean()), np.corrcoef(h,wiki)[0,1], len(rows)

print("daylight threshold sweep (sun elevation defining 'possible sunshine'):")
print(f"{'h0 (deg)':>9}{'MAE':>7}{'RMSE':>7}{'r':>8}{'samples':>9}")
for h0 in [-0.833, 0, 2, 3, 4, 5, 6, 7]:
    mae,rmse,r,n=cv_for_threshold(h0)
    print(f"{h0:>9}{mae:7.3f}{rmse:7.2f}{r:8.3f}{n:9}")

# ---- 2. Wikipedia internal consistency (monthly sum vs stated annual) -------
def linknum(cell):
    nums=re.findall(r"[0-9][0-9,]*\.?[0-9]*", cell)
    return float(nums[-1].replace(",","")) if nums else None
def cityname(cell):
    m=re.search(r"\[\[([^\]]+)\]\]", cell)
    t=m.group(1) if m else cell
    if "|" in t: t=t.split("|")[-1]
    return re.sub(r"<[^>]*>"," ",t).replace("'''","").strip()

wt = "\n".join(json.loads((root/".cache"/f).read_text())["parse"]["wikitext"]
               for f in ["wiki-sunshine.json","wiki-sunshine-europe.json"])
records=[]
cur=""
for t in wt.split('{| class="wikitable')[1:]:
    body=t.split("\n|}")[0]
    for raw in body.split("\n|-"):
        cut=raw.split("<ref")[0]
        cells=[l.strip().lstrip("|").strip() for l in cut.split("\n")
               if l.strip().startswith("|") and not l.strip().startswith(("|+","|-"))]
        if "! City" in raw or "!City" in raw: continue
        if len(cells)>=14: city=cityname(cells[1]); months=[linknum(c) for c in cells[2:14]]; year=linknum(cells[14]) if len(cells)>14 else None
        elif len(cells)==13: city=cityname(cells[0]); months=[linknum(c) for c in cells[1:13]]; year=linknum(cells[13]) if len(cells)>13 else None
        else: continue
        if sum(1 for v in months if v is not None)<12 or year is None: continue
        records.append((city,months,year))

bad=[]
for city,months,year in records:
    s=sum(months)
    if year>0 and abs(s-year)/year>0.05:
        bad.append((city,s,year,(s-year)/year*100))
print(f"\nWikipedia consistency: {len(records)} fully-populated rows checked")
print(f"  rows where sum(months) deviates from stated annual by >5%: {len(bad)}")
for c,s,y,p in sorted(bad,key=lambda x:-abs(x[3]))[:12]:
    print(f"    {c:<22} sum={s:7.1f}  annual={y:7.1f}  ({p:+.0f}%)")
