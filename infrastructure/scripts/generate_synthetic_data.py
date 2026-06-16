import pandas as pd
import numpy as np
import os
import uuid
from datetime import datetime, timedelta

def generate_campaigns(num_campaigns=100):
    channels = ['Search', 'Social', 'Email', 'Display', 'Affiliate']
    status = ['Active', 'Paused', 'Completed']
    
    data = []
    for _ in range(num_campaigns):
        campaign_id = str(uuid.uuid4())
        data.append({
            'campaign_id': campaign_id,
            'campaign_name': f'Campaign_{np.random.randint(1000, 9999)}',
            'channel': np.random.choice(channels),
            'start_date': (datetime.now() - timedelta(days=np.random.randint(10, 365))).strftime('%Y-%m-%d'),
            'end_date': (datetime.now() + timedelta(days=np.random.randint(10, 100))).strftime('%Y-%m-%d'),
            'status': np.random.choice(status),
            'spend': round(np.random.uniform(100, 50000), 2)
        })
    return pd.DataFrame(data)

def generate_campaign_attribution(campaigns_df, num_attributions=500):
    data = []
    for _ in range(num_attributions):
        data.append({
            'attribution_id': str(uuid.uuid4()),
            'campaign_id': np.random.choice(campaigns_df['campaign_id']),
            'order_id': str(uuid.uuid4()),  # In a real scenario, map to actual order IDs
            'revenue_credit': round(np.random.uniform(10, 500), 2),
            'attribution_date': (datetime.now() - timedelta(days=np.random.randint(1, 30))).strftime('%Y-%m-%d %H:%M:%S')
        })
    return pd.DataFrame(data)

def generate_support_tickets(num_tickets=200):
    categories = ['Refund', 'Delivery', 'Product Quality', 'Account Issue', 'Other']
    status = ['Open', 'In Progress', 'Resolved', 'Closed']
    
    data = []
    for _ in range(num_tickets):
        data.append({
            'ticket_id': str(uuid.uuid4()),
            'customer_id': str(uuid.uuid4()), # In a real scenario, map to actual customer IDs
            'order_id': str(uuid.uuid4()) if np.random.random() > 0.3 else None,
            'category': np.random.choice(categories),
            'status': np.random.choice(status, p=[0.2, 0.2, 0.4, 0.2]),
            'created_at': (datetime.now() - timedelta(days=np.random.randint(1, 90))).strftime('%Y-%m-%d %H:%M:%S')
        })
    return pd.DataFrame(data)

def generate_refund_reasons(num_refunds=150):
    reasons = ['Defective', 'Not as described', 'Arrived late', 'Changed mind', 'Wrong item sent']
    
    data = []
    for _ in range(num_refunds):
        data.append({
            'refund_id': str(uuid.uuid4()),
            'order_id': str(uuid.uuid4()), # In a real scenario, map to actual order IDs
            'reason': np.random.choice(reasons),
            'refund_amount': round(np.random.uniform(5, 200), 2),
            'processed_date': (datetime.now() - timedelta(days=np.random.randint(1, 60))).strftime('%Y-%m-%d %H:%M:%S')
        })
    return pd.DataFrame(data)

if __name__ == "__main__":
    os.makedirs('data/synthetic', exist_ok=True)
    
    print("Generating synthetic data...")
    
    campaigns_df = generate_campaigns()
    campaigns_df.to_csv('data/synthetic/campaigns.csv', index=False)
    
    attr_df = generate_campaign_attribution(campaigns_df)
    attr_df.to_csv('data/synthetic/campaign_attribution.csv', index=False)
    
    tickets_df = generate_support_tickets()
    tickets_df.to_csv('data/synthetic/support_tickets.csv', index=False)
    
    refunds_df = generate_refund_reasons()
    refunds_df.to_csv('data/synthetic/refund_reasons.csv', index=False)
    
    print("Synthetic data generated successfully in data/synthetic/")
