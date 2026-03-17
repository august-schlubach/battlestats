from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('warships', '0027_playerexplorersummary_efficiency_rank'),
    ]

    operations = [
        migrations.AddField(
            model_name='playerexplorersummary',
            name='efficiency_rank_tier',
            field=models.CharField(blank=True, max_length=4, null=True),
        ),
    ]
