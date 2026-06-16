SELECT
    refund_id,
    order_id,
    reason,
    refund_amount,
    CAST(processed_date AS TIMESTAMP) AS processed_date
FROM {{ source('datapilot_raw', 'raw_refund_reasons') }}
