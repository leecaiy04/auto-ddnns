import { getReverseProxyRules } from './lib/api-clients/lucky-reverseproxy.mjs';
import { getPortDetail } from './lib/api-clients/lucky-port-manager.mjs';

console.log('测试1: 获取所有端口规则');
try {
  const rules = await getReverseProxyRules();
  console.log('✅ 成功获取', rules.ruleList.length, '个端口');
  rules.ruleList.forEach(r => {
    console.log(`  端口 ${r.ListenPort}: ${r.RuleName}`);
  });
} catch (error) {
  console.error('❌ 失败:', error.message);
  console.error('堆栈:', error.stack);
}

console.log('\n测试2: 获取50000端口详情');
try {
  const port50000 = await getPortDetail(50000);
  if (port50000) {
    console.log('✅ 50000端口存在:', port50000.name);
    console.log('  子规则数量:', port50000.subRuleCount);
  } else {
    console.log('❌ 50000端口不存在');
  }
} catch (error) {
  console.error('❌ 失败:', error.message);
  console.error('堆栈:', error.stack);
}
