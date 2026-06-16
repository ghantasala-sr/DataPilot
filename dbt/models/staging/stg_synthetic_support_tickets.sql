SELECT
    ticket_id,
    customer_id,
    order_id,
    category,
    status,
    CAST(created_at AS TIMESTAMP) AS created_at
FROM {{ source('datapilot_raw', 'raw_support_tickets') }}
