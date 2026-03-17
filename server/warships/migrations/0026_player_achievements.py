from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('warships', '0025_player_efficiency_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='player',
            name='achievements_json',
            field=models.JSONField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='player',
            name='achievements_updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='PlayerAchievementStat',
            fields=[
                ('id', models.BigAutoField(auto_created=True,
                 primary_key=True, serialize=False, verbose_name='ID')),
                ('achievement_code', models.CharField(max_length=64)),
                ('achievement_slug', models.CharField(max_length=64)),
                ('achievement_label', models.CharField(max_length=128)),
                ('category', models.CharField(max_length=32)),
                ('count', models.IntegerField()),
                ('source_kind', models.CharField(default='battle', max_length=16)),
                ('refreshed_at', models.DateTimeField()),
                ('player', models.ForeignKey(on_delete=models.deletion.CASCADE,
                 related_name='achievement_stats', to='warships.player')),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(fields=(
                        'player', 'achievement_code', 'source_kind'), name='unique_player_achievement_source'),
                ],
                'indexes': [
                    models.Index(
                        fields=['player', 'achievement_slug'], name='player_ach_slug_idx'),
                    models.Index(fields=['achievement_slug'],
                                 name='achievement_slug_idx'),
                ],
            },
        ),
    ]
