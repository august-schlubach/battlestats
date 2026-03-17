from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('warships', '0026_player_achievements'),
    ]

    operations = [
        migrations.AddField(
            model_name='playerexplorersummary',
            name='badge_rows_unmapped',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='efficiency_badge_rows_total',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='efficiency_rank_percentile',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='efficiency_rank_population_size',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='efficiency_rank_updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='eligible_ship_count',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='expert_count',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='grade_i_count',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='grade_ii_count',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='grade_iii_count',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='has_efficiency_rank_icon',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='normalized_badge_strength',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='raw_badge_points',
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='playerexplorersummary',
            name='shrunken_efficiency_strength',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='playerexplorersummary',
            index=models.Index(
                fields=['efficiency_rank_percentile'], name='explorer_eff_rank_idx'),
        ),
    ]
