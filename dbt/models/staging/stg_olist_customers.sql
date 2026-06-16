SELECT
    customer_id,
    customer_unique_id,
    CAST(customer_zip_code_prefix AS STRING) AS customer_zip_code_prefix,
    customer_city,
    customer_state
FROM {{ source('datapilot_raw', 'raw_customers') }}
