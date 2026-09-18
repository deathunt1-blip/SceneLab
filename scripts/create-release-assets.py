"""Create the SceneLab icon and Chinese release guide; uses bundled ReportLab/Pillow."""
from pathlib import Path
from math import cos, sin, pi
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable
from reportlab.lib.enums import TA_LEFT

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf'
ASSETS = ROOT / 'build/resources'
OUT.mkdir(parents=True, exist_ok=True)
ASSETS.mkdir(parents=True, exist_ok=True)
INK = '#17353B'
MINT = '#59C8AE'
PALE = '#EAF3F1'
GRAY = '#536B71'
WHITE = '#FFFFFF'

# Code-native brand mark: isometric scene volume with a sampled point at its center.
im = Image.new('RGBA', (1024, 1024))
d = ImageDraw.Draw(im)
d.rounded_rectangle((8, 8, 1016, 1016), radius=226, fill=INK)
top, left, right, bottom, center = (512, 187), (216, 357), (808, 357), (512, 845), (512, 534)
d.polygon([top, right, center, left], fill='#23474F')
d.polygon([left, center, bottom, (216, 668)], fill='#1C3D43')
d.polygon([center, right, (808, 668), bottom], fill='#25545A')
for a, b in [(top,left),(top,right),(left,center),(right,center),(left,(216,668)),(right,(808,668)),((216,668),bottom),((808,668),bottom),(center,bottom)]:
    d.line([a,b], fill=MINT, width=22)
d.ellipse((462, 484, 562, 584), fill='#DFFCF3')
im.resize((512,512), Image.Resampling.LANCZOS).save(ROOT/'electron/icon.png')
im.save(ASSETS/'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

pdfmetrics.registerFont(TTFont('CN', 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('CN-Bold', 'C:/Windows/Fonts/msyhbd.ttc', subfontIndex=0))
pdfmetrics.registerFontFamily('CN', normal='CN', bold='CN-Bold')
styles = {
    'body': ParagraphStyle('body', fontName='CN', fontSize=10, leading=17, textColor=colors.HexColor(INK), spaceAfter=9, wordWrap='CJK'),
    'small': ParagraphStyle('small', fontName='CN', fontSize=8.6, leading=13.8, textColor=colors.HexColor(GRAY), spaceAfter=6, wordWrap='CJK'),
    'h1': ParagraphStyle('h1', fontName='CN-Bold', fontSize=23, leading=32, textColor=colors.HexColor(INK), spaceAfter=14),
    'h2': ParagraphStyle('h2', fontName='CN-Bold', fontSize=13, leading=20, textColor=colors.HexColor(INK), spaceBefore=10, spaceAfter=7),
    'kicker': ParagraphStyle('kicker', fontName='CN-Bold', fontSize=9, leading=14, textColor=colors.HexColor('#238B76'), spaceAfter=7),
}
story = []
def p(text, style='body'): return Paragraph(text, styles[style])
def add(text, style='body'): story.append(p(text, style))
def h(text): add(text, 'h2')
def page(number, title, intro):
    if story: story.append(PageBreak())
    add(f'SCENELAB / 使用指南 / {number:02}', 'kicker')
    add(title, 'h1')
    add(intro)
def callout(title, text):
    t = Table([[p(title, 'h2')], [p(text)]], colWidths=[483])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor(PALE)),('LEFTPADDING',(0,0),(-1,-1),13),('RIGHTPADDING',(0,0),(-1,-1),13),('TOPPADDING',(0,0),(-1,0),5),('BOTTOMPADDING',(0,-1),(-1,-1),9)]))
    story.extend([t, Spacer(1,13)])
def table(headers, rows, widths):
    data = [[p(x, 'small') for x in headers]] + [[p(str(x), 'small') for x in row] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#DCECE8')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#F4F8F7'),colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,0),0.6,colors.HexColor('#B7D3CA'))]))
    story.extend([t, Spacer(1,13)])

class SceneGraphic(Flowable):
    def __init__(self, mode='cover'): super().__init__(); self.width=483; self.height=172 if mode=='cover' else 196; self.mode=mode
    def draw(self):
        c=self.canv
        c.setFillColor(colors.HexColor(INK)); c.roundRect(0,0,self.width,self.height,12,fill=1,stroke=0)
        if self.mode=='cover':
            c.setStrokeColor(colors.HexColor('#3B686D')); c.setLineWidth(.6)
            for i in range(9):
                c.line(205+i*28,28,165+i*28,124)
            for i in range(6): c.line(205-i*8,28+i*19.2,429-i*8,28+i*19.2)
            for x,y in [(205,28),(429,28),(165,124),(389,124)]:
                c.setStrokeColor(colors.HexColor(MINT)); c.line(x,y,297,78)
                c.setFillColor(colors.HexColor(MINT)); c.roundRect(x-5,y-4,10,8,2,fill=1,stroke=0)
            c.setFillColor(colors.HexColor('#E9C982')); c.circle(297,78,5,fill=1,stroke=0)
            c.setFillColor(colors.white); c.setFont('CN-Bold',16); c.drawString(22,125,'看见空间的每一种可能')
            c.setFillColor(colors.HexColor('#B9D9D2'));c.setFont('CN',10)
            for i,line in enumerate(['相机部署','覆盖分析','理论精度']): c.drawString(23,93-i*23,line)
        else:
            c.setFont('CN',10); c.setFillColor(colors.HexColor('#D4E9E4'));c.drawString(15,174,'顶部：项目 / 方案 / 场景设计 / 仿真分析 / 技术报告')
            boxes=[(12,36,103,122,'左侧','场景对象','添加与选择'),(124,36,226,122,'中间','三维工作区','编辑 / 热图 / 分析点'),(359,36,112,122,'右侧','属性与预览','设置 / 诊断')]
            for x,y,w,hh,a,b,cc in boxes:
                c.setFillColor(colors.HexColor('#254950')); c.roundRect(x,y,w,hh,5,fill=1,stroke=0)
                for yy,txt,sz in [(y+92,a,9),(y+63,b,12),(y+37,cc,8.5)]:
                    c.setFillColor(colors.HexColor('#D4E9E4')); c.setFont('CN',sz);c.drawCentredString(x+w/2,yy,txt)
            c.setFont('CN',8); c.setFillColor(colors.HexColor('#B9D9D2'));c.drawString(15,15,'界面结构示意；窄窗口中的属性面板可能以抽屉方式展开。')

page(1, 'SceneLab v1.0\n使用说明', '光学动捕相机部署与理论精度仿真工作台')
story.extend([SceneGraphic(),Spacer(1,18)])
add('从场地到方案，用空间分析辅助部署决策。', 'h2')
add('本指南面向首次使用的同事。软件在本机运行，内置相机参数库、三维场景编辑、覆盖与理论精度分析，并可输出技术报告。')
table(['从这里开始','页码'],[
    ['安装与第一次运行','02'],['认识界面，设置场地','03'],['相机库与相机部署','04'],['对象编辑与 Marker 尺寸','05'],['运行分析与读取热图','06'],['逐像素查看相机成像','07'],['技术报告、保存与交接','08'],['常见问题与计算边界','09'],
],[410,73])
add('版本 1.0.0 · Windows x64 · 发布日期 2026-09-18', 'small')

page(2, '安装与第一次运行', '选择安装版或免安装版即可。两者功能一致，均自带运行环境，不需要安装 Node.js，也不需要联网登录。')
h('方式 A / 免安装版')
add('1. 将 SceneLab-1.0.0-Windows-x64.zip <b>完整解压</b>到普通文件夹。<br/>2. 打开该文件夹，双击 <b>SceneLab.exe</b>。<br/>3. 保留同目录的 resources、locales 等运行文件。不要只转发 exe，也不要在压缩包里直接运行。')
h('方式 B / 安装版')
add('运行 SceneLab-1.0.0-Setup-x64.exe，按向导选择安装位置。安装后可从桌面或开始菜单打开「SceneLab」。更新前先关闭旧版窗口并导出项目备份。')
table(['环境','说明'],[
    ['操作系统','Windows 10 / 11，64 位（x64）；其他平台未验证。'],
    ['显示与显卡','建议 1920 × 1080 或更高分辨率；三维显示需要可用的显卡驱动。'],
    ['联网','基本工作流程离线可用；项目和参数保存在本机。'],
    ['企业电脑','本版未做数字签名。如受管设备阻止运行，请交由 IT 审核。'],
],[100,383])
h('五分钟完成第一轮分析')
add('① 首次启动打开演示场景，先熟悉三维视图。<br/>② 在右侧设置场地长、宽、高与采样间距。<br/>③ 用「相机参数库」确认参数，用「阵列部署」布置相机。<br/>④ 点击「运行分析」，切换「覆盖数量」与「定位精度」。<br/>⑤ 打开「技术报告」查看结果，再从顶部「导出项目」保存文件。')
callout('说明书随程序携带', '按 <b>F1</b> 打开本指南，或打开程序同目录的「使用说明.pdf」。也可按 Alt 查看「帮助」菜单。')

page(3, '认识界面，设置场地', '先确定计算空间与相机位置，再运行分析。修改参数后，要关注结果是否显示「分析已过期」。')
story.extend([SceneGraphic('layout'),Spacer(1,14)])
table(['区域','主要用途'],[
    ['顶部','切换项目、方案和工作模式；打开项目、导出项目、进入相机参数库。'],
    ['左侧场景对象','选择相机、安装结构、障碍物、Marker 与刚体；查看对象列表。'],
    ['中间三维视图','选择与操作对象，切换视角，查看热图和观测连线。'],
    ['右侧属性','无对象选中时查看场景设置；选中对象后编辑坐标、姿态及参数。'],
],[100,383])
h('设置计算空间')
add('在「场景设置」中输入长度、宽度与高度，单位为 m。世界坐标 Z 轴向上。相机、障碍物与 Marker 的位置也使用 m；Marker 直径使用 mm，成像尺寸使用 px。')
add('缩小场地后，检查相机和场景物体是否仍在需要的位置。若分析点已超出新场地，软件会将其移回场地中心；也可点击「分析场地中心」。修改后重新运行分析。')
h('三维视图导航')
add('<b>右键拖动</b>旋转视角；<b>中键拖动</b>平移；<b>滚轮</b>缩放。可切换透视、正交、俯视、前视、侧视。选中对象后按 <b>F</b> 聚焦；需要查看全场时使用「适配场景」。')

page(4, '相机库与相机部署', '相机库保存型号参数；场景中的每台相机保存一份独立参数快照。更改库中的型号，不会自动覆盖已经布置的相机。')
h('选择或新建型号')
add('打开「相机参数库」，按型号搜索或按厂商筛选。新建型号时填写名称、分辨率、视野、工作距离和 Marker 相关阈值。基础模式通过分辨率与 FOV 推导内参；已有标定数据时可使用标定模式填写内参及畸变。')
add('编辑完成后，点击弹窗底部固定的 <b>「保存型号」</b>。看到保存成功提示后再关闭。若参数校验失败，按提示修正；若出现本地存储失败提示，保留草稿并先导出备份。只关闭弹窗不等于保存型号。')
h('内置青瞳数据库')
add('按 CHINGMU 筛选可找到导入的青瞳型号。数据库来自《青瞳相机数据库标准数据表_V1.0.xlsx》，包含 18 个型号、29 套光学配置及 5 套 R3 帧模式信息。不同镜头和分辨率模式分别选择。')
add('原表缺失字段采用可编辑的仿真假设：图像点误差 0.1 px、最小成像阈值 4 px、最近距离 0 m（不限制）、无畸变。这些不是厂商标定结论。R1 为参考视频相机，不参与 Marker 求解；R3 新部署时默认关闭，可按需要启用。', 'small')
h('部署与调整')
add('点击「阵列部署」，选择型号、相机数量、形状、安装高度与朝向。生成后每台相机均可单独调整。在左侧或三维视图选中相机，修改 XYZ、Yaw / Pitch / Roll，或用三维手柄移动、旋转。')
table(['操作','提示'],[
    ['朝向场景中心','用于快速把相机朝向当前计算空间中心。'],
    ['替换相机型号','在选中相机的属性里更换；检查新的视野、距离和像素阈值。'],
    ['更新参数快照','库发生变化时，点击「更新为参数库版本」才会应用到当前相机。'],
    ['结构吸附','吸附是一次性定位；后续移动结构不会自动带动相机。'],
],[110,373])
callout('演示参数与真实参数', 'M4 · Demo 及随包提供的 ABC-400 均为合成教学数据。真实项目请使用经过确认的镜头、分辨率、标定与工作距离参数。')

page(5, '对象编辑与 Marker 尺寸', '左侧场景树和中间三维视图都可选择对象。按 Ctrl 或 Shift 配合点击可多选，然后进行批量操作。')
table(['快捷键','效果'],[
    ['Ctrl+C / Ctrl+V','复制所选对象 / 粘贴副本；副本略作偏移并自动选中。'],
    ['Ctrl+D','直接创建所选对象的副本。'],
    ['Ctrl+Z','撤销最近的场景编辑。'],
    ['Ctrl+Y / Ctrl+Shift+Z','重做已撤销的场景编辑。'],
    ['Delete','删除所选场景对象。'],
    ['F','聚焦所选对象，便于查看较小的 Marker。'],
    ['F1','打开使用说明（桌面版）。'],
],[145,338])
add('输入框获得焦点时，复制、粘贴、撤销等快捷键用于文本编辑。场景对象剪贴板与撤销历史只在当前运行会话中使用，不能替代导出项目文件。', 'small')
h('两种直径设置，各有用途')
table(['设置位置','影响范围'],[
    ['仿真设置 → 仿真 Marker 直径','用于空间采样和分析点；也是新建 Marker 的默认直径。不会批量改变已有 Marker 对象。'],
    ['选中 Marker → Marker 直径','修改这个对象的实际三维球体大小和对应成像尺寸。刚体内各 Marker 可分别设置。'],
],[180,303])
add('三维球体按实际毫米直径显示。例如 12 mm 改为 6 mm，直径变为原来的一半。大场景中可能很难看到小 Marker：先从左侧列表选中，再按 F 聚焦。')
h('刚体与障碍物')
add('可以添加四点刚体，也可多选至少 3 个 Marker 建立刚体。方体、圆柱和墙用于表示遮挡物。注意「显示」与「参与仿真 / 参与遮挡」是独立开关：隐藏对象不一定代表从分析中移除。')

page(6, '运行分析与读取热图', '点击「运行分析」并等待完成。修改场地、相机或 Marker 后，请重新计算，或开启「自动重新计算」。')
h('采样间距决定分析网格密度')
add('在「仿真设置」调整采样间距，单位为 m。小场地可从 0.1 m 开始，大场地先用 0.5 m 或 1 m 做粗看，再局部调整方案。间距减半时，三维采样量通常约为原来的 8 倍，计算会更慢。')
add('边界不能被间距整除时，软件以等距单元中心覆盖整个场地，实际间距不超过输入值。热图最多显示 60,000 个均匀抽样点，统计使用全部有效采样点；计算上限为 1,200,000 点。', 'small')
table(['查看内容','如何理解'],[
    ['覆盖数量','每处采样点有多少台有效相机能观察到；使用 ≥2、≥3、≥4 等指标比较方案。'],
    ['定位精度','预计三维位置误差（mm）。深蓝误差较小、浅蓝误差较大；色标上限为精度阈值的两倍。'],
    ['灰色单元','没有有效覆盖，或多目几何不足以可靠定位。'],
    ['高度裁切与透明度','用于查看内部或指定高度的空间分布，不改变底层分析参数。'],
],[125,358])
h('分析点和相机连线是什么')
add('点击热图可以选择空间分析点。该点与各相机之间的连线展示观测关系；结合右侧「空间点诊断」中的观测状态判断是否有效。它不是物体的运动轨迹，也不是场地边界。')
add('缩小场地后，超出边界的分析点会移回中心。若仍有疑问，点击「分析场地中心」，再「运行分析」，查看逐台相机的失败原因。')
callout('有两台相机看到，并不必然精度好', '视野、距离、遮挡、Marker 像素尺寸和多目几何都会影响结果。遇到「不可定位」时，优先查看具体失败原因，再调整相机方向、位置或参数。')

page(7, '逐像素查看相机成像', '二维概览保留易读的场景符号；放大窗口按相机原始分辨率生成仿真像素，用来检查 Marker 在画面中占多少像素。')
h('操作步骤')
add('1. 在场景树或三维视图中选中一台相机。<br/>2. 找到右侧的「相机成像预览」。<br/>3. 点击 <b>「放大查看像素」</b>。<br/>4. 在右侧 Marker 列表中选择目标，定位到对应成像位置。<br/>5. 使用 1×、4×、16×、64×按钮，或滚轮继续缩放；拖动图像平移。')
table(['控制或读数','含义'],[
    ['适应窗口','将整个相机画幅放进当前查看窗口。'],
    ['1×','每个相机像素以一个查看区逻辑像素显示；屏幕缩放比例可能影响物理显示大小。'],
    ['8×及以上','开启「像素网格」后，每一格对应一个相机像素。'],
    ['成像宽 × 高','Marker 投影在相机画面中的宽度和高度，单位 px。'],
    ['场景辅助线','用于帮助理解空间位置；查看 Marker 时可关闭以减少干扰。'],
],[128,355])
h('如何判断 Marker 是否太小')
add('结合 Marker 的投影宽高和相机型号的最小像素阈值查看。例如当前直径缩小后，成像只有约 3 px，而型号要求至少 4 px，该观测可能被判定为「Marker 过小」。请以该相机的实际诊断结果为准。')
callout('像素放大不会增加相机分辨率', '放大窗口保留像素边界，便于数格子。它显示的是几何仿真：未模拟曝光、衍射、传感器噪声及阈值分割；不能当作真实相机拍摄的光斑照片。')
add('遮挡的 Marker 不成像；图像边缘、视野外、距离不合适等情况可结合观测状态与空间点诊断检查。', 'small')

page(8, '技术报告、保存与交接', '发送项目文件可让同事继续编辑；发送技术报告可让对方直接阅读部署结果。两者用途不同，建议一起保留。')
h('导出技术报告')
add('1. 确认分析已经完成且未过期。<br/>2. 点击顶部「技术报告」，选择报告语言和需要的章节。<br/>3. 检查部署清单、热图、统计与诊断结果。<br/>4. 在 <b>「各相机二维成像视图」</b>独立章节中逐台查看二维概览和 Marker 像素数据。<br/>5. 点击「打印 / 保存 PDF」，在系统打印窗口选择 PDF 打印机并保存。')
add('软件会生成场景、俯视、前视、侧视及覆盖 / 精度等报告截图。报告里的二维图采用概览表达，像素网格放大请在软件的「放大查看像素」窗口查看。', 'small')
h('项目与参数库分别保存')
table(['需要保留的内容','操作'],[
    ['当前项目与方案','顶部「导出项目」，保存 .cameraplanner.json 文件；对方用「打开项目」导入。'],
    ['自定义相机库','在「相机参数库」中导出 JSON 或 CSV；完整备份建议优先使用 JSON。'],
    ['可阅读的分析结论','通过技术报告保存 PDF；PDF 不用于恢复可编辑场景。'],
],[132,351])
add('项目中的相机参数快照随项目文件保存。要让自定义型号同时出现在同事的参数库中，还需单独导出并导入参数库。导入前请先备份对方已有数据。')
callout('自动保存 ≠ 跨电脑备份', '数据保存在当前 Windows 用户的本机目录。复制程序文件夹不会带走项目，免安装版也不会把项目自动放进 U 盘。换电脑、重装或清理应用数据前，请导出项目和参数库。')
add('为兼容旧版，数据目录仍为 %APPDATA%\\Camera Planner。安装版与免安装版使用同一用户数据目录；请避免同时运行旧版和新版。重新打开项目后需重新计算分析结果。', 'small')

page(9, '常见问题与计算边界', '先检查当前配置和结果状态，再调整方案。遇到问题时，项目文件比单张截图更便于复现。')
table(['现象','建议检查'],[
    ['没有热图 / 缺少有效相机','先重新运行分析；再看相机是否启用、是否朝向场地，以及视野、距离、遮挡和像素阈值。'],
    ['场地变小后网格很少','减小仿真设置中的采样间距，再计算。'],
    ['分析点或连线位置不对','点击「分析场地中心」；确认新场地尺寸，再运行分析。'],
    ['新相机型号没有保存','在参数库底部点「保存型号」，检查校验或本地存储错误提示。'],
    ['修改库后场景未变化','选中已部署相机，明确更新其参数快照。'],
    ['Marker 改了直径但仍很小','确认改的是对象直径；三维按实际尺寸绘制，选中后按 F 聚焦。'],
    ['程序启动失败 / 端口占用','确认 ZIP 已完整解压；关闭旧版窗口后重开。三维黑屏时检查显卡驱动。'],
],[143,340])
h('v1.0 的计算范围')
add('精度为理论 <b>1σ 三维位置 RMS</b>，不代表现场系统精度承诺。标定残差、安装误差、反射、照明、温度、振动和刚体姿态误差未纳入；水体散射、浑浊和折射变化也不在当前模型内。')
add('误差均值及 P90 / P95 只统计可定位点；覆盖率与精度达标率以全部有效采样点为分母，障碍物内部点排除。不要只比较平均误差而忽略不可定位区域。')
add('当前没有账号同步、自动升级或任意方向剖切面。仿真预览不是照片级渲染，圆柱在二维概览中用外包框表达。v1.0 是当前实现功能的发布版，不代表原始 PRD 的全部条目已完成。', 'small')
h('反馈给项目维护人时')
add('附上：软件版本、复现步骤、预期与实际结果、问题截图，以及允许共享的项目文件。若涉及自定义型号，同时提供相机库 JSON。发送前检查文件中是否含有不适合共享的项目名称或参数。')

def furniture(c, doc):
    c.saveState()
    c.setStrokeColor(colors.HexColor('#D6E3DE')); c.setLineWidth(.6); c.line(56,48,539,48)
    c.setFont('CN',8);c.setFillColor(colors.HexColor(GRAY));c.drawString(56,32,'SCENELAB  v1.0   /   光学动捕部署与仿真')
    c.drawRightString(539,32,f'{doc.page:02} / 09');c.restoreState()

target = OUT/'SceneLab_v1.0_使用说明.pdf'
doc=SimpleDocTemplate(str(target),pagesize=(595.28,841.89),rightMargin=56,leftMargin=56,topMargin=48,bottomMargin=64,
    title='SceneLab v1.0 使用说明',author='SceneLab',subject='Windows x64 安装、部署、分析与项目交接')
doc.build(story,onFirstPage=furniture,onLaterPages=furniture)
print(target)
