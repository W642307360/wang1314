export type HallKey='cats'|'dogs'|'birds'|'aquatic'|'exotic'|'more'
export type BreedItem={id:string;name:string;en:string;desc:string;image:string}
export type Hall={key:HallKey;name:string;subtitle:string;hero:string;accent:string;breeds:BreedItem[]}

const photos={
 cats:['https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=700&q=88','https://images.unsplash.com/photo-1533738363-b7f9aef128ce?auto=format&fit=crop&w=700&q=88','https://images.unsplash.com/photo-1596854407944-bf87f6fdd49e?auto=format&fit=crop&w=700&q=88'],
 dogs:['https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=700&q=88','https://images.unsplash.com/photo-1561037404-61cd46aa615b?auto=format&fit=crop&w=700&q=88','https://images.unsplash.com/photo-1558788353-f76d92427f16?auto=format&fit=crop&w=700&q=88'],
 birds:['https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=700&q=88','https://images.unsplash.com/photo-1522926193341-e9ffd686c60f?auto=format&fit=crop&w=700&q=88'],
 aquatic:['https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?auto=format&fit=crop&w=700&q=88','https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=700&q=88'],
 exotic:['https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=700&q=88','https://images.unsplash.com/photo-1535338454770-8be927b5a00b?auto=format&fit=crop&w=700&q=88'],
 more:['https://images.unsplash.com/photo-1452857297128-d9c29adba80b?auto=format&fit=crop&w=700&q=88']
}
const names:Record<HallKey,string[]>={
 cats:['布偶猫','缅因猫','英短蓝猫','银渐层','金渐层','蓝金渐层','紫金渐层','金点','银点','乳白','美短','暹罗猫','德文卷毛','无毛猫','加菲猫','波斯猫','折耳猫','矮脚猫','三花猫','高地猫','拿破仑猫','狸花猫','孟加拉豹猫','俄罗斯蓝猫','斯芬克斯','阿比西尼亚','新加坡猫','缅甸猫','挪威森林猫','索马里猫','喜马拉雅猫','曼基康','伯曼猫','科尼斯卷毛','西伯利亚猫','呵叻猫','日本短尾猫','中国狸花猫','塞浦路斯猫','库里尔短尾猫','萨凡纳猫','切瑟尔猫','哈瓦那棕猫','约克巧克力猫','塞伦盖蒂猫','加利福尼亚闪亮猫','欧西猫','雪鞋猫','爪哇猫','巴厘猫','安哥拉猫','土耳其梵猫','东方猫','卡尔特猫','曼岛猫','夏特尔猫','土耳其安哥拉','塞尔凯克卷毛','柯尼斯卷毛','其他品种'],
 dogs:['西高地','马尔济斯','雪纳瑞','马尔泰','其他狗狗','金毛','拉布拉多','哈士奇','阿拉斯加','柴犬','萨摩耶','柯基','边牧','贵宾','比熊','法斗','巴哥','博美','德牧','秋田','杜宾','卡斯罗','马犬','罗威纳','藏獒','松狮','圣伯纳','伯恩山','纽芬兰犬','古牧','苏牧','喜乐蒂','斑点狗','大丹犬','灵缇','惠比特','牛头梗','贝灵顿','约克夏','吉娃娃','鹿犬','蝴蝶犬','京巴','西施','冠毛犬','泰迪','腊肠','杜高','比特','加纳利','恶霸犬','纽波利顿'],
 birds:['虎皮鹦鹉','玄凤鹦鹉','牡丹鹦鹉','小太阳鹦鹉','金丝雀','文鸟','珍珠鸟','芙蓉鸟','鸽子'],
 aquatic:['锦鲤','金鱼','龙鱼','发财鱼','地图鱼','孔雀鱼','灯鱼','神仙鱼','罗汉鱼','斗鱼','红剑','玛丽','黑玛丽','红绿灯','米奇鱼','斑马鱼','接吻鱼','虎皮鱼','红尾鲨','鼠鱼','异型鱼','七彩神仙','招财猫','银龙','海马','小丑鱼','蓝魔','倒吊','蝴蝶鱼','青蛙鱼'],
 exotic:['垂耳兔','侏儒兔','荷兰猪','蜜袋鼯','龙猫','仓鼠','刺猬','守宫','鬃狮蜥','玉米蛇','角蛙','寄居蟹','蜘蛛','蝎子','蜈蚣','地图龟','蚂蚁','蜜蜂','蚕宝宝','水母','蝈蝈','羊驼','鸵鸟','人工孔雀'],
 more:['全部宠物','新品种申请','稀有宠物档案','领养专区','宠物用品']
}
const meta:Record<HallKey,[string,string,string,string]>={
 cats:['猫猫馆','优雅、灵动与温柔陪伴','安静柔软的生命伙伴','#a77b63'],
 dogs:['狗狗馆','忠诚、热情与长久陪伴','认识每一个犬种','#9a7048'],
 birds:['鸟类馆','灵动羽色与悦耳鸣唱','聆听自然的声音','#6f8b72'],
 aquatic:['水族馆','静谧水景与斑斓生命','把海洋带回家','#527c86'],
 exotic:['奇宠馆','探索特别的生命伙伴','尊重每一种不同','#8a7460'],
 more:['更多馆','领养、用品与新品种','发现更多可能','#77736c']
}
const english:Record<string,string>={'布偶猫':'Ragdoll','缅因猫':'Maine Coon','金渐层':'Golden Shaded','金毛':'Golden Retriever','拉布拉多':'Labrador','柴犬':'Shiba Inu','萨摩耶':'Samoyed','柯基':'Welsh Corgi','边牧':'Border Collie','虎皮鹦鹉':'Budgerigar','锦鲤':'Koi','金鱼':'Goldfish','垂耳兔':'Lop Rabbit','龙猫':'Chinchilla'}
const verifiedPortraits:Record<string,string>={
 '布偶猫':'Ragdoll from Gatil Ragbelas.jpg',
 '缅因猫':'Maine Coon Fallen male Angel of Canadian Summer 01.jpg',
 '英短蓝猫':'A British Shorthair cat.jpg',
 '暹罗猫':'Siamese cat 1960.jpg',
 '波斯猫':'Persian Cat.jpg',
 '无毛猫':'20170604 Sphynx cat 7984.jpg',
 '斯芬克斯':'Cat Sphynx. img 040.jpg'
}
const commonsPortrait=(file:string)=>`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=720`

export const halls:Hall[]=(Object.keys(names) as HallKey[]).map(key=>{
 const [name,subtitle,tagline,accent]=meta[key]
 return {key,name,subtitle,hero:photos[key][0],accent,breeds:names[key].map((name,i)=>({id:`${key}-${i+1}`,name,en:english[name]||'Pet Breed',desc:`${tagline} · 标准品种档案`,image:verifiedPortraits[name]?commonsPortrait(verifiedPortraits[name]):photos[key][i%photos[key].length]}))}
})
export const hallByKey=(key:HallKey)=>halls.find(x=>x.key===key)||halls[0]
