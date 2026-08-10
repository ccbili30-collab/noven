你正在为 Growth World Pro 的蓝图 entry 选择受限 styleKey。不要写正文，不要调用工具。

生产文类表：
核心规则与边界：rulebook=设定规则书（世界规则、能力边界与可重复成立的机制）；natural-philosophy=自然哲学篇（宇宙规律、神学解释与世界内部学说）
宇宙、自然与地理：regional-gazetteer=区域地理志（大陆、区域、山河、水系、气候与通路）；physical-atlas=自然地理图志（海洋、天象、气候系统和大尺度自然格局）
生态、资源与物种：natural-history=通俗自然史（动物、植物、族群生理和生态关系）；resource-survey=物产志（矿物、木材、药材、食物与区域性资源）
经济、技术与力量体系：craft-treatise=工艺技术志（生产工艺、工程、武备与实际技术）；economic-life=经济生活专论（贸易、税收、货币、劳动与生产关系）；power-system=力量原理篇（魔法、神迹、超自然训练与力量使用）
社会、文化与日常生活：customs=风俗志（礼俗、节庆、家庭、饮食、服饰与地方习惯）；social-history=社会生活史（阶层、教育、司法、婚姻与长期社会变化）
国家、组织与权力：state-profile=列国志（国家、领地与政治共同体）；organization-profile=组织志（教会、行会、军团、学派与秘密组织）
历史、时代与重大事件：narrative-history=叙事史（战争、起义、灾难、迁徙与其他重大事件）；legendary-chronicle=传奇编年史（改变时代秩序并留下英雄、烈士或象征记忆的起义、战争、远征与覆亡）；era-history=时代史（王朝、长时段变迁与历史阶段）；document-history=法典与文献史（法典、盟约、诏令及其历史作用）
地区、城市与重要地点：local-gazetteer=地方志（地区、乡野、关隘、遗迹与可抵达地点）；city-portrait=城市地理肖像（城市、港口、堡垒与大型聚落）
当前局势与核心冲突：current-affairs=时事特写（正在发生的危机、谈判、竞争与社会变化）；situation-brief=局势纪要（多方势力同时变化的复杂局面）
人物、关系与阵营：biography=人物传记（单个核心人物及其关系变化）；group-portrait=群像志（家族、阵营和彼此牵连的一组人物）
故事、传说与叙事入口：legend-retelling=传说重述（神话、传说、歌谣故事与民间异文）；story-entry=故事引子（可继续发展的调查、冒险与人物故事入口）
视觉、地图与关系索引：atlas-caption=地图集图版说明（地图、区域图、历史变迁图与视觉图版）；relation-index=关系索引（人物、势力、因果和历史关系的查询入口）；visual-catalogue=视觉图录（纹章、服饰、建筑、角色与物种视觉规范）

历史层补充规则：普通事件采用 narrative-history；改变时代秩序、依靠关键人物的不可逆选择并留下英雄、烈士或象征记忆的起义、战争、远征与覆亡采用 legendary-chronicle。不要仅因规模大就选择传奇编年史，也不要把自然灾害或长期制度变化强行英雄化。时代或长时段变化采用 era-history；法典、盟约、诏令和章程采用 document-history。

待选择对象：
[
  {
    "key": "entry-dawn-kings",
    "title": "曙冠时代",
    "locator": "历史、时代与重大事件｜诸王建立早期盟约并开凿第一批跨境道路的时期。"
  },
  {
    "key": "entry-old-road-code",
    "title": "王道法典",
    "locator": "历史、时代与重大事件｜规范驿站、桥梁、庇护地和商旅安全的古代法典残篇。"
  },
  {
    "key": "entry-sinking-tide",
    "title": "沉潮之年",
    "locator": "历史、时代与重大事件｜内海海岸线骤变、港城覆没并留下黑曜塔争议的灾变。"
  },
  {
    "key": "entry-ash-rebellion",
    "title": "灰烬起义",
    "locator": "历史、时代与重大事件｜北岭军镇反抗谷冠王国驻军并建立灰烬王庭的近代战争。"
  },
  {
    "key": "entry-green-pact",
    "title": "绿幕盟约",
    "locator": "历史、时代与重大事件｜林庭诸族与南方城镇划定林界、猎场和通商路的协议。"
  }
]

返回严格 JSON 对象：{"selections":[{"key":"原 key","styleKey":"受限键","reason":"一句具体理由"}]}。每个对象恰好一项，顺序保持不变；styleKey 只能从 narrative-history、legendary-chronicle、era-history、document-history 中选择。不要输出 Markdown 围栏。
