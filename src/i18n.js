export function createI18n(VERSION) {
    return {
        'zh-CN': {
            title: `Game Dodge — Enhanced v${VERSION}`,
            menu_select_prompt: '请选择关卡或进入编辑器：',
            menu_builtin_levels: '内置关卡', menu_start_level: '开始关卡', menu_edit: '编辑',
            menu_custom_levels: '自定义关卡', menu_start_custom: '开始自定义关卡', menu_blank_editor: '进入空白编辑器',
            menu_instructions: '操作说明',
            menu_instructions_game: '<span class="tag">新!</span> 不准动模式下金刚炮台也会被暂停。<br><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> 移动；鼠标移动视角；左键/空格射击；<span class="kbd">Esc</span> 暂停/继续。',
            // Updated instruction
            menu_instructions_editor: '<span class="tag">新!</span> 编辑器：新增墙壁“端点拉伸模式”，可精确设置墙壁位置。<br>左键拖拽对象；右键旋转视角；Shift+左键平移。',

            victory_title: '恭喜过关！', victory_message: '点击任意处返回主菜单。',

            hud_hp: 'HP', hud_time: '时间', hud_goal: '目标',
            goal_elimination: (count) => `摧毁所有炮台（${count} 剩余）`, goal_survival: '坚持到计时结束',
            goal_waypoint: (current, total) => `接触路标 (${current} / ${total})`,

            pause_title: '暂停', pause_resume: '继续', pause_restart: '重开本关', pause_quit: '退出到菜单',
            pause_back_to_editor: '返回编辑器',
            pause_hint: '提示：也可以按 <span class="kbd">Esc</span> 继续游戏。',

            lock_hint: '点击画布进入鼠标模式；或按住 <b>右键</b> 拖动也可临时旋转视角。',

            // Editor
            editor_title: '编辑器', editor_test: '测试关卡', editor_exit: '返回菜单', editor_save: '保存', editor_load: '加载',
            editor_export: '导出JSON', editor_import: '导入JSON',
            editor_level_name: '关卡名称', editor_slot: '槽位', editor_object_list: '对象列表', editor_level_settings: '关卡设置',
            editor_mode: '模式', editor_mode_elimination: '炮台歼灭模式', editor_mode_survival: '倒计时模式', editor_mode_waypoint: '不准动模式', editor_mode_topdown: '第三人称俯瞰模式',
            editor_time: '时间(秒)', editor_player_hp: '玩家HP', editor_arena_w: '场地宽W', editor_arena_d: '场地深D', editor_topdown_view_enabled: '第三人称俯瞰视角', editor_topdown_angle: '俯瞰角度(°)', editor_topdown_distance: '俯瞰距离', editor_environment: '环境设置',
            editor_day_night_enabled: '启用昼夜循环', editor_cycle_duration: '循环时长(秒)', editor_sun_intensity: '日照强度',
            editor_sky_color_default: '默认天空色', editor_sky_color_day: '白天色', editor_sky_color_night: '夜间色',

            editor_central_gem_settings: '中央宝石灯设置', editor_central_gem_height: '高度', editor_central_gem_intensity: '亮度',
            editor_central_gem_color: '颜色',

            editor_lighthouse_settings: '灯塔设置', editor_lighthouse_intensity: '灯光亮度', editor_lighthouse_color: '灯光颜色',
            editor_tower_color: '塔身颜色', editor_upload_tower_texture: '上传塔身图片', editor_tower_texture_scale: '塔身纹理缩放',

            editor_column_settings: '柱子设置', editor_color: '颜色', editor_upload_column_texture: '上传柱子图片', editor_column_texture_scale: '柱子纹理缩放',

            editor_crosshair_settings: '全局准星设置', editor_global_tips: '修改将全局保存并应用。',
            editor_crosshair_color: '颜色', editor_crosshair_thickness: '粗细', editor_crosshair_size: '大小',

            editor_ground_settings: '地面设置', editor_ground_style: '地面风格',
            style_checkered: '方格 (默认)', style_scifi: '科技面板', style_textile: '编织纹理', style_classic: '古典瓷砖', style_custom: '自定义图片',
            editor_base_color: '底色', editor_pattern_color: '花纹色',
            editor_upload_texture: '上传图片', editor_clear_texture: '清除', editor_texture_scale: '纹理大小/缩放',

            editor_object_properties: '对象属性', editor_object_type: '对象类型',
            obj_player: '玩家起点', obj_turret: '普通炮台', obj_turret_kingkong: '金刚炮台', obj_wall: '墙壁', obj_waypoint: '路标',
            editor_pos_x: '位置 X', editor_pos_z: '位置 Z',
            editor_turret_style: '炮台风格',
            tstyle_scifi_blue: '科幻蓝 (默认)', tstyle_military_green: '军工绿', tstyle_stealth_black: '潜伏黑', tstyle_alert_red: '警戒红', tstyle_construction_yellow: '工程黄',
            editor_turret_type: '炮台类型', ttype_fixed: '固定', ttype_moving: '移动', ttype_tracking: '追踪',
            editor_fire_rate: '射速 (秒/发)', editor_bullet_speed: '子弹速度',
            editor_move_speed_tier: '移动速度档位', gear_slow: '慢速 (x0.5)', gear_medium: '中速 (x0.7)', gear_fast: '快速 (x1.0)',
            editor_move_mode: '移动模式（无路径时）', mmode_lr: '左右', mmode_area: '四周',
            editor_patrol_w: '巡逻宽 W', editor_patrol_d: '巡逻深 D',
            editor_path_settings: '移动轨迹（可选）', editor_path_edit: '编辑路径', editor_path_done: '完成', editor_path_clear: '清空', editor_path_loop: '循环',

            editor_turret_hp: '生命值 (HP)', editor_turret_body_color: '机体颜色',
            editor_turret_aoe_radius: 'AOE 范围', editor_turret_aoe_damage: 'AOE 伤害', editor_turret_aoe_interval: 'AOE 间隔(秒)',
            editor_kingkong_tips: '金刚炮台在没有路径时会自动追踪玩家。',

            // Wall Editor i18n updates
            editor_wall_properties: '墙壁属性', editor_wall_style: '墙体风格',
            editor_wall_tips_new: '拖动墙体移动。使用“拖拽模式”或“拉伸模式”调整端点。', // New Key
            editor_wall_drag_mode: '传统拖拽模式', // New Key
            editor_wall_stretch_mode: '端点拉伸模式', // New Key
            editor_wall_stretch_instructions: '点击一个绿色端点开始拉伸，然后在地图上点击目标位置。', // New Key
            editor_wall_extend_mode: '外延模式',
            editor_wall_extend_instructions: '点击一个绿色端点作为起点，然后在地图上点击新端点以生成并连接新的墙体。',

            wstyle_brick: '红砖墙 (默认)', wstyle_glass: '玻璃墙', wstyle_castle: '古堡石墙', wstyle_wood: '原木风格', wstyle_imperial: '紫禁城风格', wstyle_cute: '可爱风格', wstyle_geometric: '几何图案', wstyle_custom: '自定义图片',
            editor_thickness_t: '厚度 T', editor_height_h: '高度 H',
            editor_waypoint_properties: '路标属性', editor_waypoint_order: '顺序编号',
            editor_waypoint_size: '尺寸', editor_waypoint_color: '辉光颜色',
            editor_waypoint_intensity: '辉光亮度', editor_waypoint_textColor: '数字颜色',

            editor_add_new: '添加新对象', editor_delete_selected: '删除选中对象',

            alert_select_turret: '请先选中一个炮台', alert_select_object: '请先选中一个对象', alert_player_cannot_delete: '玩家起点不能删除，但可以移动。',
            alert_save_failed: (msg) => `保存失败：${msg}`, alert_slot_empty: '该槽位没有存档', alert_invalid_json: '导入的JSON文件格式不正确，请检查文件内容。',
            alert_waypoint_order_exists: (order) => `编号为 ${order} 的路标已存在。请使用唯一的编号。`
        },
        'en-US': {
            title: `Game Dodge — Enhanced v${VERSION}`,
            menu_select_prompt: 'Please select a level or enter the editor:',
            menu_builtin_levels: 'Built-in Levels', menu_start_level: 'Start Level', menu_edit: 'Edit',
            menu_custom_levels: 'Custom Level', menu_start_custom: 'Start Custom Level', menu_blank_editor: 'Enter Blank Editor',
            menu_instructions: 'Instructions',
            menu_instructions_game: '<span class="tag">New!</span> King Kong turret also pauses in Waypoint mode when aimed at.<br><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> to move; Mouse to look; Left-click/Space to shoot; <span class="kbd">Esc</span> to pause/resume.',
            // Updated instruction
            menu_instructions_editor: '<span class="tag">New!</span> Editor: New "Endpoint Stretch Mode" for walls allows precise positioning.<br>Left-drag objects; Right-drag to rotate view; Shift+Left-drag to pan.',

            victory_title: 'Victory!', victory_message: 'Click anywhere to return to the main menu.',

            hud_hp: 'HP', hud_time: 'Time', hud_goal: 'Goal',
            goal_elimination: (count) => `Destroy all turrets (${count} remaining)`, goal_survival: 'Survive until time runs out',
            goal_waypoint: (current, total) => `Touch Waypoint (${current} / ${total})`,

            pause_title: 'Paused', pause_resume: 'Resume', pause_restart: 'Restart Level', pause_quit: 'Quit to Menu',
            pause_back_to_editor: 'Back to Editor',
            pause_hint: 'Hint: Press <span class="kbd">Esc</span> to resume the game.',

            lock_hint: 'Click the canvas to enter mouse mode; or hold <b>Right Button</b> and drag to temporarily rotate the view.',

            // Editor
            editor_title: 'Editor', editor_test: 'Test Level', editor_exit: 'Back to Menu', editor_save: 'Save', editor_load: 'Load',
            editor_export: 'Export JSON', editor_import: 'Import JSON',
            editor_level_name: 'Level Name', editor_slot: 'Slot', editor_object_list: 'Object List', editor_level_settings: 'Level Settings',
            editor_mode: 'Mode', editor_mode_elimination: 'Elimination Mode', editor_mode_survival: 'Survival Mode', editor_mode_waypoint: 'Waypoint Mode', editor_mode_topdown: 'Third-person Top-down',
            editor_time: 'Time (s)', editor_player_hp: 'Player HP', editor_arena_w: 'Arena W', editor_arena_d: 'Arena D', editor_topdown_view_enabled: 'Third-person Top-down View', editor_topdown_angle: 'Top-down Angle (°)', editor_topdown_distance: 'Top-down Distance', editor_environment: 'Environment',
            editor_day_night_enabled: 'Enable Day/Night Cycle', editor_cycle_duration: 'Cycle Duration (s)', editor_sun_intensity: 'Sun Intensity',
            editor_sky_color_default: 'Default Sky', editor_sky_color_day: 'Day Sky', editor_sky_color_night: 'Night Sky',

            editor_central_gem_settings: 'Central Gem Light', editor_central_gem_height: 'Height', editor_central_gem_intensity: 'Intensity',
            editor_central_gem_color: 'Color',

            editor_lighthouse_settings: 'Lighthouse Settings', editor_lighthouse_intensity: 'Light Intensity', editor_lighthouse_color: 'Light Color',
            editor_tower_color: 'Tower Color', editor_upload_tower_texture: 'Upload Tower Image', editor_tower_texture_scale: 'Tower Texture Scale',

            editor_column_settings: 'Column Settings', editor_color: 'Color', editor_upload_column_texture: 'Upload Column Image', editor_column_texture_scale: 'Column Texture Scale',

            editor_crosshair_settings: 'Global Crosshair Settings', editor_global_tips: 'Changes are saved globally.',
            editor_crosshair_color: 'Color', editor_crosshair_thickness: 'Thickness', editor_crosshair_size: 'Size',

            editor_ground_settings: 'Ground Settings', editor_ground_style: 'Ground Style',
            style_checkered: 'Checkered (Default)', style_scifi: 'Sci-Fi Panel', style_textile: 'Textile', style_classic: 'Classic Tiles', style_custom: 'Custom Image',
            editor_base_color: 'Base Color', editor_pattern_color: 'Pattern Color',
            editor_upload_texture: 'Upload Image', editor_clear_texture: 'Clear', editor_texture_scale: 'Texture Size/Scale',

            editor_object_properties: 'Object Properties', editor_object_type: 'Object Type',
            obj_player: 'Player Start', obj_turret: 'Standard Turret', obj_turret_kingkong: 'King Kong Turret', obj_wall: 'Wall', obj_waypoint: 'Waypoint',
            editor_pos_x: 'Pos X', editor_pos_z: 'Pos Z',
            editor_turret_style: 'Turret Style',
            tstyle_scifi_blue: 'Sci-Fi Blue (Default)', tstyle_military_green: 'Military Green', tstyle_stealth_black: 'Stealth Black', tstyle_alert_red: 'Alert Red', tstyle_construction_yellow: 'Construction Yellow',
            editor_turret_type: 'Turret Type', ttype_fixed: 'Fixed', ttype_moving: 'Moving', ttype_tracking: 'Tracking',
            editor_fire_rate: 'Fire Rate (s/shot)', editor_bullet_speed: 'Bullet Speed',
            editor_move_speed_tier: 'Move Speed Tier', gear_slow: 'Slow (x0.5)', gear_medium: 'Medium (x0.7)', gear_fast: 'Fast (x1.0)',
            editor_move_mode: 'Move Mode (no path)', mmode_lr: 'Left-Right', mmode_area: 'Area',
            editor_patrol_w: 'Patrol W', editor_patrol_d: 'Patrol D',
            editor_path_settings: 'Movement Path (Optional)', editor_path_edit: 'Edit Path', editor_path_done: 'Done', editor_path_clear: 'Clear', editor_path_loop: 'Loop',

            editor_turret_hp: 'Health (HP)', editor_turret_body_color: 'Body Color',
            editor_turret_aoe_radius: 'AOE Radius', editor_turret_aoe_damage: 'AOE Damage', editor_turret_aoe_interval: 'AOE Interval (s)',
            editor_kingkong_tips: 'King Kong turret will automatically track the player when no path is set.',

            // Wall Editor i18n updates
            editor_wall_properties: 'Wall Properties', editor_wall_style: 'Wall Style',
            editor_wall_tips_new: 'Drag wall body to move. Use "Drag Mode" or "Stretch Mode" to adjust endpoints.', // New Key
            editor_wall_drag_mode: 'Classic Drag Mode', // New Key
            editor_wall_stretch_mode: 'Endpoint Stretch Mode', // New Key
            editor_wall_stretch_instructions: 'Click a green endpoint to start stretching, then click the target location on the map.', // New Key
            editor_wall_extend_mode: 'Extend Mode',
            editor_wall_extend_instructions: 'Click a green endpoint to set the anchor, then click on the ground to create a new wall connected to it.',

            wstyle_brick: 'Brick (Default)', wstyle_glass: 'Glass', wstyle_castle: 'Castle Stone', wstyle_wood: 'Wood Log', wstyle_imperial: 'Imperial', wstyle_cute: 'Cute', wstyle_geometric: 'Geometric', wstyle_custom: 'Custom Image',
            editor_thickness_t: 'Thickness T', editor_height_h: 'Height H',
            editor_waypoint_properties: 'Waypoint Properties',
            editor_waypoint_order: 'Order Number', editor_waypoint_size: 'Size',
            editor_waypoint_color: 'Glow Color', editor_waypoint_intensity: 'Glow Intensity',
            editor_waypoint_textColor: 'Number Color',

            editor_add_new: 'Add New Object', editor_delete_selected: 'Delete Selected',

            alert_select_turret: 'Please select a turret first.', alert_select_object: 'Please select an object first.', alert_player_cannot_delete: 'Player start point cannot be deleted, but can be moved.',
            alert_save_failed: (msg) => `Save failed: ${msg}`, alert_slot_empty: 'This slot is empty.', alert_invalid_json: 'The imported JSON file has an incorrect format. Please check the file content.',
            alert_waypoint_order_exists: (order) => `A waypoint with order ${order} already exists. Please use a unique number.`
        }
    };
}
