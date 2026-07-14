ALTER TABLE breeds ADD COLUMN alias TEXT;
ALTER TABLE breeds ADD COLUMN evolution TEXT;

UPDATE breeds
SET alias=COALESCE(NULLIF(alias,''),name || '标准品种'),
    evolution=COALESCE(NULLIF(evolution,''),name || '源自' || origin || '，经长期自然适应与规范繁育，逐步形成稳定的外形、体态和性格特征。');
