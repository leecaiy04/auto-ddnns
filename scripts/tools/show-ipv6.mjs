#!/usr/bin/env node
/**
 * 从设备 IPv6 信息中提取全局地址
 *
 * 根据 Hermes 查询到的数据：
 * 192.168.9.10 (debian服务器) 的全局 IPv6 地址
 */

const devices = {
  '192.168.9.10': {
    name: 'debian服务器',
    mac: 'BC:24:11:88:7E:DF',
    ipv6: [
      '240e:391:c8a:4071::3e0',
      '240e:391:c83:c341:be24:11ff:fe88:7edf',
      'fe80::be24:11ff:fe88:7edf'  // 链路本地
    ]
  },
  '192.168.9.200': {
    name: '飞牛os',
    mac: 'BC:24:11:29:92:A4',
    ipv6: [
      '240e:391:c8a:4071::c39',
      '240e:391:c83:c341::c39',
      '240e:391:c83:cad1::c39',
      'fe80::c988:875d:1759:5b14'  // 链路本地
    ]
  },
  '192.168.9.201': {
    name: '群晖',
    mac: 'BC:24:11:AF:93:A1',
    ipv6: [
      '240e:391:c8a:4071::f6d',
      'fe80::be24:11ff:feaf:93a1',  // 链路本地
      'fe80::c98a:d519:d297:2593'   // 链路本地
    ]
  },
  '192.168.9.2': {
    name: 'iStore软路由器',
    mac: 'BC:24:11:9F:BA:81',
    ipv6: [
      '240e:391:c83:c341:be24:11ff:fe9f:ba81',  // SLAAC
      '240e:391:c83:c341::ab7',                  // DHCPv6
      'fe80::be24:11ff:fe9f:ba81'                // 链路本地
    ]
  }
};

/**
 * 过滤全局 IPv6 地址
 */
function getGlobalIpv6(ipv6List) {
  return ipv6List.filter(ip => !ip.startsWith('fe80:'));
}

const deviceIp = process.argv[2];

if (!deviceIp) {
  console.log('📊 所有设备的全局 IPv6 地址:');
  console.log('');

  for (const [ip, info] of Object.entries(devices)) {
    const globalIpv6 = getGlobalIpv6(info.ipv6);
    const status = globalIpv6.length > 0 ? '✅' : '⚠️';

    console.log(`${status} ${ip.padEnd(15)} ${info.name}`);
    console.log(`   MAC: ${info.mac}`);

    if (globalIpv6.length > 0) {
      console.log(`   全局 IPv6 (${globalIpv6.length} 个):`);
      globalIpv6.forEach((addr, index) => {
        console.log(`     ${index + 1}. ${addr}`);
      });
    } else {
      console.log(`   ⚠️  仅有链路本地地址，无全局 IPv6`);
    }
    console.log('');
  }
} else {
  const device = devices[deviceIp];

  if (!device) {
    console.error(`❌ 未找到设备 ${deviceIp}`);
    console.error('');
    console.error('可用设备:');
    Object.keys(devices).forEach(ip => {
      console.error(`  - ${ip} (${devices[ip].name})`);
    });
    process.exit(1);
  }

  const globalIpv6 = getGlobalIpv6(device.ipv6);

  console.log(`设备: ${deviceIp} (${device.name})`);
  console.log(`MAC:  ${device.mac}`);
  console.log('');

  if (globalIpv6.length > 0) {
    console.log(`✅ 全局 IPv6 地址 (${globalIpv6.length} 个):`);
    globalIpv6.forEach((addr, index) => {
      console.log(`  ${index + 1}. ${addr}`);
    });
    console.log('');
    console.log(`🎉 主要 IPv6 地址: ${globalIpv6[0]}`);
  } else {
    console.log('⚠️  该设备没有全局 IPv6 地址');
    console.log('');
    console.log('仅有链路本地地址:');
    device.ipv6.forEach(addr => {
      console.log(`  - ${addr}`);
    });
  }
}
