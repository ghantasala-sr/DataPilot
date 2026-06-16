SELECT
    product_id,
    product_category_name,
    product_name_lenght,
    product_description_lenght,
    product_photos_qty
FROM {{ source('datapilot_raw', 'raw_products') }}
