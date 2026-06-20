"""Can a flexible model (LightGBM / gradient boosting) predict recorded sunshine
better than the calibrated linear model, and how much of the residual is just
reference noise in Wikipedia?

Uses the cached NASA POWER climatology + static/sunshine.json. All errors are
out-of-fold from GroupKFold grouped BY CITY (no leakage between a city's months).
"""
import json, math, numpy as np
from pathlib import Path
from sklearn.model_selection import GroupKFold
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import HistGradientBoostingRegressor
import lightgbm as lgb

root = Path(__file__).resolve().parent
data = json.loads((root / ".." / "static" / "sunshine.json").read_text())
prog = json.loads((root / ".cache" / "power-progress.json").read_text())

MID = [15,46,74,105,135,166,196,227,258,288,319,349]
def decl(N):
    g = 2*math.pi/365*(N-1)
    return (0.006918-0.399912*math.cos(g)+0.070257*math.sin(g)-0.006758*math.cos(2*g)
            +0.000907*math.sin(2*g)-0.002697*math.cos(3*g)+0.00148*math.sin(3*g))
def daylight(lat,N):
    la=math.radians(lat); d=decl(N)
    c=(math.sin(math.radians(-0.833))-math.sin(la)*math.sin(d))/(math.cos(la)*math.cos(d))
    return 24.0 if c<=-1 else 0.0 if c>=1 else 24/math.pi*math.acos(c)

rows=[]
for i in range(data["n"]):
    p = prog.get(f"{data['lat'][i]},{data['lon'][i]}")
    if not p: continue
    lat=data["lat"][i]
    for m in range(12):
        w=data["sun"][i][m]; allv=p["all"][m]; clr=p["clr"][m]; toa=p["toa"][m]; cld=p.get("cld",[None]*12)[m]
        if None in (w,allv,clr,toa,cld) or toa<0.3 or clr<0.3: continue
        N=daylight(lat,MID[m])
        if N<1: continue
        rh=(p.get("rh") or [None]*12)[m]; pr=(p.get("pre") or [None]*12)[m]
        rows.append(dict(city=i, lat=lat, m=m, N=N, wiki=w, nN=w/N,
                         KT=allv/toa, CF=min(1,allv/clr), CA=cld/100,
                         RH=(rh/100 if rh is not None else np.nan),
                         PR=(math.log1p(pr) if pr is not None else np.nan),
                         alat=abs(lat)/90, msin=math.sin(2*math.pi*m/12), mcos=math.cos(2*math.pi*m/12)))

import pandas as pd
df=pd.DataFrame(rows)
print(f"{len(df)} city-months, {df.city.nunique()} cities\n")
groups=df.city.values
y=df.nN.values; N=df.N.values; wiki=df.wiki.values

def hours_metrics(pred_nN):
    h=np.clip(pred_nN,0,1)*N
    e=h-wiki
    r=np.corrcoef(h,wiki)[0,1]
    return dict(mae=np.abs(e).mean(), rmse=math.sqrt((e**2).mean()), bias=e.mean(), r=r)

def cv_oof(make_model, feats):
    X=df[feats].values
    oof=np.zeros(len(df)); train_mae=[]
    gkf=GroupKFold(5)
    for tr,te in gkf.split(X,y,groups):
        mdl=make_model(); mdl.fit(X[tr],y[tr])
        oof[te]=mdl.predict(X[te])
        th=np.clip(mdl.predict(X[tr]),0,1)*N[tr]; train_mae.append(np.abs(th-wiki[tr]).mean())
    met=hours_metrics(oof); met["train_mae"]=np.mean(train_mae); return met

lin3=["KT","CF","CA"]
allf=["KT","CF","CA","RH","PR","alat","msin","mcos"]

def lgbm():
    return lgb.LGBMRegressor(n_estimators=400, learning_rate=0.03, num_leaves=15,
        min_child_samples=40, subsample=0.8, colsample_bytree=0.8, reg_lambda=1.0,
        verbosity=-1, num_threads=1, n_jobs=1, force_col_wise=True)
def hgb():
    return HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05,
        max_leaf_nodes=15, min_samples_leaf=40, l2_regularization=1.0)

print(f"{'model':<34}{'MAE':>6}{'RMSE':>7}{'bias':>7}{'r':>7}{'trainMAE':>10}")
print("-"*71)
for name,mk,f in [
    ("linear KT+CF+CA",        lambda:LinearRegression(), lin3),
    ("linear all features",    lambda:LinearRegression(), allf),
    ("HistGradientBoosting",   hgb, allf),
    ("LightGBM",               lgbm, allf),
]:
    m=cv_oof(mk,f)
    print(f"{name:<34}{m['mae']:6.2f}{m['rmse']:7.2f}{m['bias']:+7.2f}{m['r']:7.3f}{m['train_mae']:10.2f}")

# Feature importance (LightGBM, full fit)
g=lgbm(); g.fit(df[allf].values,y)
imp=sorted(zip(allf,g.feature_importances_),key=lambda x:-x[1])
print("\nLightGBM feature importance:", ", ".join(f"{k}={v}" for k,v in imp))

# ---- Independent reference-noise floor: nearby city pairs --------------------
# Cities within ~100 km have essentially the same true climatology, so the
# spread in their Wikipedia values estimates the irreducible reference noise.
lat=np.array([data["lat"][i] for i in range(data["n"])])
lon=np.array([data["lon"][i] for i in range(data["n"])])
sun=[data["sun"][i] for i in range(data["n"])]
def km(i,j):
    dlat=(lat[i]-lat[j])*111
    dlon=(lon[i]-lon[j])*111*math.cos(math.radians((lat[i]+lat[j])/2))
    return math.hypot(dlat,dlon)
diffs=[]; pairs=0
for i in range(data["n"]):
    for j in range(i+1,data["n"]):
        if abs(lat[i]-lat[j])>1.5: continue
        if km(i,j)<=100:
            pairs+=1
            for m in range(12):
                a,b=sun[i][m],sun[j][m]
                if a is not None and b is not None: diffs.append(a-b)
if diffs:
    d=np.array(diffs)
    # Var(a-b)=2*sigma^2 -> per-city reference noise sigma:
    print(f"\nNearby-pair check: {pairs} city pairs <100km, {len(diffs)} month-comparisons")
    print(f"  RMS difference between co-located cities: {math.sqrt((d**2).mean()):.2f} h/day")
    print(f"  => implied per-city reference noise sigma ~ {math.sqrt((d**2).mean()/2):.2f} h/day")
