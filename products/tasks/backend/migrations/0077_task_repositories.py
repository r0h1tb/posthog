from django.contrib.postgres.fields import ArrayField
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("tasks", "0076_taskrun_task_run_sd_branch_idx")]

    operations = [
        migrations.AddField(
            model_name="task",
            name="repositories",
            field=ArrayField(
                base_field=models.CharField(max_length=255),
                default=list,
                db_default=[],
                blank=True,
                size=None,
                help_text="GitHub repositories available to this task",
            ),
        ),
    ]
