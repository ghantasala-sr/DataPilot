import pandas as pd
import numpy as np
import os
import uuid
from datetime import datetime, timedelta

def generate_olist():
    os.makedirs('data/olist', exist_ok=True)
    
    # 1. Customers
    num_customers = 1000
    customers = pd.DataFrame({
        'customer_id': [str(uuid.uuid4()) for _ in range(num_customers)],
        'customer_unique_id': [str(uuid.uuid4()) for _ in range(num_customers)],
        'customer_zip_code_prefix': np.random.randint(10000, 99999, num_customers),
        'customer_city': np.random.choice(['sao paulo', 'rio de janeiro', 'belo horizonte', 'curitiba'], num_customers),
        'customer_state': np.random.choice(['SP', 'RJ', 'MG', 'PR'], num_customers)
    })
    customers.to_csv('data/olist/olist_customers_dataset.csv', index=False)
    
    # 2. Orders
    num_orders = 1500
    order_status = ['delivered', 'shipped', 'canceled', 'invoiced', 'processing']
    orders = pd.DataFrame({
        'order_id': [str(uuid.uuid4()) for _ in range(num_orders)],
        'customer_id': np.random.choice(customers['customer_id'], num_orders),
        'order_status': np.random.choice(order_status, num_orders, p=[0.9, 0.03, 0.03, 0.02, 0.02]),
        'order_purchase_timestamp': [(datetime.now() - timedelta(days=np.random.randint(1, 365))).strftime('%Y-%m-%d %H:%M:%S') for _ in range(num_orders)],
    })
    orders['order_approved_at'] = pd.to_datetime(orders['order_purchase_timestamp']) + pd.to_timedelta(np.random.randint(1, 48), unit='h')
    orders['order_delivered_carrier_date'] = orders['order_approved_at'] + pd.to_timedelta(np.random.randint(1, 5), unit='D')
    orders['order_delivered_customer_date'] = orders['order_delivered_carrier_date'] + pd.to_timedelta(np.random.randint(1, 15), unit='D')
    orders['order_estimated_delivery_date'] = orders['order_approved_at'] + pd.to_timedelta(np.random.randint(5, 20), unit='D')
    
    # Nullify dates for non-delivered
    mask = orders['order_status'] != 'delivered'
    orders.loc[mask, 'order_delivered_customer_date'] = np.nan
    orders.to_csv('data/olist/olist_orders_dataset.csv', index=False)
    
    # 3. Products
    num_products = 500
    categories = ['bed_bath_table', 'health_beauty', 'sports_leisure', 'furniture_decor', 'computers_accessories']
    products = pd.DataFrame({
        'product_id': [str(uuid.uuid4()) for _ in range(num_products)],
        'product_category_name': np.random.choice(categories, num_products),
        'product_name_lenght': np.random.randint(20, 60, num_products),
        'product_description_lenght': np.random.randint(100, 1000, num_products),
        'product_photos_qty': np.random.randint(1, 5, num_products)
    })
    products.to_csv('data/olist/olist_products_dataset.csv', index=False)
    
    # 4. Sellers
    num_sellers = 100
    sellers = pd.DataFrame({
        'seller_id': [str(uuid.uuid4()) for _ in range(num_sellers)],
        'seller_zip_code_prefix': np.random.randint(10000, 99999, num_sellers),
        'seller_city': np.random.choice(['sao paulo', 'rio de janeiro', 'belo horizonte', 'curitiba'], num_sellers),
        'seller_state': np.random.choice(['SP', 'RJ', 'MG', 'PR'], num_sellers)
    })
    sellers.to_csv('data/olist/olist_sellers_dataset.csv', index=False)
    
    # 5. Order Items
    num_items = 2000
    order_items = pd.DataFrame({
        'order_id': np.random.choice(orders['order_id'], num_items),
        'order_item_id': np.random.randint(1, 4, num_items),
        'product_id': np.random.choice(products['product_id'], num_items),
        'seller_id': np.random.choice(sellers['seller_id'], num_items),
        'shipping_limit_date': [(datetime.now() + timedelta(days=np.random.randint(1, 30))).strftime('%Y-%m-%d %H:%M:%S') for _ in range(num_items)],
        'price': round(np.random.uniform(10, 1000), 2),
        'freight_value': round(np.random.uniform(5, 100), 2)
    })
    # ensure uniqueness of order_id + order_item_id
    order_items = order_items.drop_duplicates(subset=['order_id', 'order_item_id'])
    order_items.to_csv('data/olist/olist_order_items_dataset.csv', index=False)
    
    # 6. Payments
    payment_types = ['credit_card', 'boleto', 'voucher', 'debit_card']
    payments = pd.DataFrame({
        'order_id': orders['order_id'],
        'payment_sequential': 1,
        'payment_type': np.random.choice(payment_types, len(orders)),
        'payment_installments': np.random.randint(1, 10, len(orders)),
        'payment_value': order_items.groupby('order_id')['price'].sum().reindex(orders['order_id']).fillna(0).reset_index(drop=True) + order_items.groupby('order_id')['freight_value'].sum().reindex(orders['order_id']).fillna(0).reset_index(drop=True)
    })
    payments.to_csv('data/olist/olist_order_payments_dataset.csv', index=False)
    
    # 7. Reviews
    reviews = pd.DataFrame({
        'review_id': [str(uuid.uuid4()) for _ in range(len(orders))],
        'order_id': orders['order_id'],
        'review_score': np.random.choice([1, 2, 3, 4, 5], len(orders), p=[0.1, 0.05, 0.1, 0.2, 0.55]),
        'review_comment_title': [f"Review {i}" if np.random.random() > 0.5 else "" for i in range(len(orders))],
        'review_comment_message': [f"Comment {i}" if np.random.random() > 0.5 else "" for i in range(len(orders))],
        'review_creation_date': orders['order_purchase_timestamp'], # Simplified
        'review_answer_timestamp': orders['order_purchase_timestamp'] # Simplified
    })
    reviews.to_csv('data/olist/olist_order_reviews_dataset.csv', index=False)
    
    # 8. Geolocation
    geolocation = pd.DataFrame({
        'geolocation_zip_code_prefix': np.random.randint(10000, 99999, 100),
        'geolocation_lat': np.random.uniform(-33, 5, 100),
        'geolocation_lng': np.random.uniform(-73, -34, 100),
        'geolocation_city': np.random.choice(['sao paulo', 'rio de janeiro', 'belo horizonte', 'curitiba'], 100),
        'geolocation_state': np.random.choice(['SP', 'RJ', 'MG', 'PR'], 100)
    })
    geolocation.to_csv('data/olist/olist_geolocation_dataset.csv', index=False)

if __name__ == "__main__":
    generate_olist()
