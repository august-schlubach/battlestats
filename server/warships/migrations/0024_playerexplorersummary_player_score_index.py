from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('warships', '0023_playerexplorersummary_player_score'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='playerexplorersummary',
            index=models.Index(fields=['player_score'],
                               name='explorer_score_idx'),
        ),
    ]
