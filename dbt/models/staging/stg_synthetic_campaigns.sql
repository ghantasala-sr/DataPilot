SELECT
    campaign_id,
    campaign_name,
    channel,
    CAST(start_date AS DATE) AS start_date,
    CAST(end_date AS DATE) AS end_date,
    status,
    spend
FROM {{ source('datapilot_raw', 'raw_campaigns') }}
