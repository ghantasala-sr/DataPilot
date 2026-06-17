SELECT
    product_id,
    product_category_name,
    product_weight_g,
    product_length_cm,
    product_height_cm,
    product_width_cm,
    product_name_lenght,
    product_description_lenght,
    product_photos_qty
FROM {{ source('datapilot_raw', 'raw_products') }}
