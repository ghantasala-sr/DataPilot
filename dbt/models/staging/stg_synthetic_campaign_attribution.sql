SELECT
    attribution_id,
    campaign_id,
    order_id,
    revenue_credit,
    CAST(attribution_date AS TIMESTAMP) AS attribution_date
FROM {{ source('datapilot_raw', 'raw_campaign_attribution') }}
