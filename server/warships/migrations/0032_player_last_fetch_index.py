from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('warships', '0031_playerexplorersummary_clan_battle_fields'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='player',
            index=models.Index(
                fields=['last_fetch'], name='player_last_fetch_idx'),
        ),
    ]
