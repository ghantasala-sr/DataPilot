SELECT
    seller_id,
    CAST(seller_zip_code_prefix AS STRING) AS seller_zip_code_prefix,
    seller_city,
    seller_state
FROM {{ source('datapilot_raw', 'raw_sellers') }}
