from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('warships', '0019_add_player_name_trigram_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='ship',
            name='chart_name',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
    ]
