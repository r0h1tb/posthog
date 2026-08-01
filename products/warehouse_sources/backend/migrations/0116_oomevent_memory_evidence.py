from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("warehouse_sources", "0115_scaffold_four_requested_sources")]

    operations = [
        migrations.AddField(
            model_name="externaldataschemaoomevent",
            name="memory_fraction",
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="externaldataschemaoomevent",
            name="max_partition_bytes",
            field=models.BigIntegerField(blank=True, null=True),
        ),
    ]
