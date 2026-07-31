from parameterized import parameterized

from products.warehouse_sources.backend.duckgres_naming import canonical_duckgres_table_name


class TestCanonicalDuckgresTableName:
    @parameterized.expand(
        [
            ("mysql", "MySQL", "SalesEU", "customer_orders", "mysql_saleseu_customer_orders"),
            ("bigquery", "BigQuery", None, "daily_stats", "bigquery_daily_stats"),
            ("google_ads", "GoogleAds", None, "video", "googleads_video"),
            ("tiktok_ads", "TikTokAds", "prod", "ad_report", "tiktokads_prod_ad_report"),
        ]
    )
    def test_source_keys_are_stable_without_camel_case_splitting(
        self, _name: str, source_type: str, prefix: str | None, schema_name: str, expected: str
    ) -> None:
        assert canonical_duckgres_table_name(source_type, prefix, schema_name) == expected

    def test_long_names_have_stable_collision_resistant_suffixes(self) -> None:
        first = canonical_duckgres_table_name("Postgres", None, "a" * 90)
        second = canonical_duckgres_table_name("Postgres", None, "a" * 89 + "b")

        assert len(first) == 63
        assert len(second) == 63
        assert first != second
        assert first == canonical_duckgres_table_name("Postgres", None, "a" * 90)
