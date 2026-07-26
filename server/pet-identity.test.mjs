import assert from "node:assert/strict";
import test from "node:test";
import { buildPetIdentityProfile } from "./pet-identity.mjs";

test("宠物身份证首次生成后编号保持稳定，资料可以更新", () => {
  const original = buildPetIdentityProfile({
    id: 196,
    name: "金穗绒球甜布偶",
    breed: "布偶猫",
    gender: "female",
    age_months: 3,
    color: "海豹双色",
    created_at: "2026-07-18 10:00:00",
  });
  assert.match(original.identity_no, /^FC-C000196-\d{2}$/);
  assert.match(original.chip_no, /^VFC-000196-\d{6}$/);
  assert.equal(original.gender, "母");
  assert.equal(original.display_name, "待宠物主起名");
  const updated = buildPetIdentityProfile({
    id: 196,
    name: "金穗绒球布偶",
    breed: "布偶猫",
    gender: "female",
    age_months: 4,
    color: "蓝双色",
    created_at: "2026-07-18 10:00:00",
  }, {
    identity_no: original.identity_no,
    chip_no: original.chip_no,
    issued_date: original.issued_date,
    birth_date: original.birth_date,
  });
  assert.equal(updated.identity_no, original.identity_no);
  assert.equal(updated.chip_no, original.chip_no);
  assert.equal(updated.issued_date, original.issued_date);
  assert.equal(updated.color, "蓝双色");
  assert.equal(updated.birth_date, original.birth_date);
});

test("宠物身份证缺失资料使用明确默认值", () => {
  const profile = buildPetIdentityProfile({
    id: 7,
    name: "待核验宠物",
    breed: "奇宠",
    created_at: "2026-07-20 00:00:00",
  });
  assert.equal(profile.gender, "待核验");
  assert.equal(profile.color, "自然综合色");
  assert.equal(profile.health_status, "健康");
  assert.equal(profile.vaccine_record, "健康（待商家补充详细记录）");
  assert.notEqual(profile.personality, "待商家补充");
  assert.equal(profile.algorithm_version, "pet-identity-v2");
  assert.match(profile.identity_no, /^FC-P000007-\d{2}$/);
});

test("缺失性格时按统一规则生成一次并保持稳定", () => {
  const pet = {
    id: 23,
    name: "性格生成测试",
    breed: "布偶猫",
    created_at: "2026-07-20 00:00:00",
  };
  const first = buildPetIdentityProfile(pet);
  const second = buildPetIdentityProfile(pet, first);
  assert.equal(second.personality, first.personality);
  assert.match(JSON.parse(second.source_json).personality, /generated/);
  const supplied = buildPetIdentityProfile({ ...pet, personality: "温顺亲人" }, first);
  assert.equal(supplied.personality, "温顺亲人");
});

test("宠物身份证优先采用商品详情已解析资料", () => {
  const profile = buildPetIdentityProfile({
    id: 9,
    name: "展示商品名",
    breed: "金毛犬",
    created_at: "2026-07-20 00:00:00",
    description:
      "性别：弟弟；出生日期：2026年4月18日；毛色：奶油金；体型：大型；毛发长度：中长毛；性格：亲人活泼；健康状态：健康；疫苗记录：基础免疫完成",
  });
  assert.equal(profile.display_name, "待宠物主起名");
  assert.equal(profile.gender, "公");
  assert.equal(profile.birth_date, "2026.04.18");
  assert.equal(profile.color, "奶油金");
  assert.equal(profile.body_type, "大型");
  assert.equal(profile.fur_length, "中长毛");
  assert.equal(profile.personality, "亲人活泼");
  assert.equal(profile.health_status, "健康");
  assert.equal(profile.vaccine_record, "基础免疫完成");
});
