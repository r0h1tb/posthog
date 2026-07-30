from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("tasks", "0075_task_pin")]

    operations = [
        migrations.AddField(
            model_name="taskartifact",
            name="export_asset_id",
            field=models.BigIntegerField(blank=True, null=True),
        ),
    ]
