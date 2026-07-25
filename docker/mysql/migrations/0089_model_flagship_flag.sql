-- 0089_model_flagship_flag.sql
-- 模型「旗舰」标识。admin 可把某模型标为旗舰;用户端模型选择器对旗舰模型做差异化展示
-- (名字彩色 + 「旗舰」小标签),突出主推的强模型。
--
-- 幂等:add_column_if_not_exists 见列已存在即跳过。DEFAULT 0 = 存量模型默认非旗舰,行为不变。

CALL add_column_if_not_exists('agent_models', 'flagship', 'TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''旗舰模型标识(1=旗舰,用户选择器差异化高亮+旗舰标签)''');
