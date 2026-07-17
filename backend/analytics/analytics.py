import json
import sys
import os
from datetime import datetime, timedelta
from supabase import create_client
import pandas as pd

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def get_client():
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_transactions(sb):
    data = sb.table("transactions").select("id, type, mode, digital_method, amount, party, category_id, txn_date, description, created_at").order("txn_date", desc=True).execute()
    return data.data or []

def fetch_categories(sb):
    data = sb.table("categories").select("id, name").execute()
    return {c["id"]: c["name"] for c in (data.data or [])}

def compute_summary(txns, categories):
    df = pd.DataFrame(txns)
    if df.empty:
        return {
            "overview": {"total_credit": 0, "total_debit": 0, "net_balance": 0, "txn_count": 0},
            "monthly_trend": [],
            "category_breakdown": [],
            "payment_mode_split": {"cash": {"credit": 0, "debit": 0}, "digital": {"credit": 0, "debit": 0}},
            "top_parties": [],
            "weekly_trend": [],
            "daily_avg": {"credit": 0, "debit": 0},
        }

    df["txn_date"] = pd.to_datetime(df["txn_date"])
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
    df["month"] = df["txn_date"].dt.to_period("M").astype(str)
    df["week"] = df["txn_date"].dt.isocalendar().week.astype(int)
    df["weekday"] = df["txn_date"].dt.day_name()
    df["category_name"] = df["category_id"].map(categories).fillna("Uncategorized")

    total_credit = float(df[df["type"] == "credit"]["amount"].sum())
    total_debit = float(df[df["type"] == "debit"]["amount"].sum())

    # Monthly trend
    monthly = df.groupby(["month", "type"])["amount"].sum().unstack(fill_value=0).reset_index()
    monthly_trend = []
    for _, row in monthly.iterrows():
        entry = {"month": row["month"]}
        entry["credit"] = float(row.get("credit", 0))
        entry["debit"] = float(row.get("debit", 0))
        entry["net"] = entry["credit"] - entry["debit"]
        monthly_trend.append(entry)
    monthly_trend.sort(key=lambda x: x["month"])

    # Category breakdown
    cat_df = df[df["type"] == "debit"].groupby("category_name")["amount"].sum().reset_index()
    cat_df = cat_df.sort_values("amount", ascending=False)
    category_breakdown = [{"name": row["category_name"], "value": float(row["amount"])} for _, row in cat_df.iterrows()]

    # Payment mode split
    mode_df = df.groupby(["mode", "type"])["amount"].sum().unstack(fill_value=0)
    payment_mode_split = {}
    for mode in ["cash", "digital"]:
        if mode in mode_df.index:
            payment_mode_split[mode] = {
                "credit": float(mode_df.loc[mode].get("credit", 0)),
                "debit": float(mode_df.loc[mode].get("debit", 0)),
            }
        else:
            payment_mode_split[mode] = {"credit": 0, "debit": 0}

    # Top parties
    party_df = df.groupby("party")["amount"].sum().reset_index()
    party_df = party_df.dropna(subset=["party"])
    party_df = party_df.sort_values("amount", ascending=False).head(10)
    top_parties = [{"name": row["party"], "amount": float(row["amount"])} for _, row in party_df.iterrows()]

    # Weekly trend (last 7 days)
    now = df["txn_date"].max()
    week_start = now - timedelta(days=6)
    recent = df[df["txn_date"] >= week_start]
    weekly = recent.groupby([pd.Grouper(key="txn_date", freq="D"), "type"])["amount"].sum().unstack(fill_value=0).reset_index()
    weekly["date"] = weekly["txn_date"].dt.strftime("%Y-%m-%d")
    weekly_trend = []
    for _, row in weekly.iterrows():
        weekly_trend.append({
            "date": row["date"],
            "credit": float(row.get("credit", 0)),
            "debit": float(row.get("debit", 0)),
        })

    # Daily averages
    unique_days = df["txn_date"].dt.date.nunique()
    daily_avg = {
        "credit": round(total_credit / max(unique_days, 1), 2),
        "debit": round(total_debit / max(unique_days, 1), 2),
    }

    return {
        "overview": {
            "total_credit": total_credit,
            "total_debit": total_debit,
            "net_balance": total_credit - total_debit,
            "txn_count": len(df),
        },
        "monthly_trend": monthly_trend,
        "category_breakdown": category_breakdown,
        "payment_mode_split": payment_mode_split,
        "top_parties": top_parties,
        "weekly_trend": weekly_trend,
        "daily_avg": daily_avg,
    }

def main():
    sb = get_client()
    txns = fetch_transactions(sb)
    categories = fetch_categories(sb)
    result = compute_summary(txns, categories)
    print(json.dumps(result))

if __name__ == "__main__":
    main()
