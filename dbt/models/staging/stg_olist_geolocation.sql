SELECT
    CAST(geolocation_zip_code_prefix AS STRING) AS geolocation_zip_code_prefix,
    geolocation_lat,
    geolocation_lng,
    geolocation_city,
    geolocation_state
FROM {{ source('datapilot_raw', 'raw_geolocation') }}
