/**
 * 设置页面
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Palette, BarChart2, Info } from 'lucide-react';
import { Card } from '@/components/common';
import { useAppSettings } from '@/contexts';
import styles from './Settings.module.css';

function parsePeriods(value: string, fallback: number[]) {
  const periods = value
    .split(/[，,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);

  return periods.length > 0 ? periods : fallback;
}

export function Settings() {
  const { settings, updateSettings } = useAppSettings();
  const [maDraft, setMaDraft] = useState(settings.indicatorConfig.ma.join(', '));
  const [rsiDraft, setRsiDraft] = useState(settings.indicatorConfig.rsi.join(', '));

  const updateIndicatorConfig = (
    updates: Partial<typeof settings.indicatorConfig>
  ) => {
    updateSettings({
      indicatorConfig: {
        ...settings.indicatorConfig,
        ...updates,
      },
    });
  };

  return (
    <div className={styles.settings}>
      <motion.h1
        className={styles.title}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        设置
      </motion.h1>

      <Card>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <RefreshCw size={18} className={styles.sectionIcon} />
            <h3>刷新频率</h3>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>列表 / 自选</span>
                <span className={styles.settingDesc}>总览、自选、扫描等列表数据刷新间隔</span>
              </div>
              <select
                className={styles.select}
                value={settings.refreshInterval.list}
                onChange={(e) =>
                  updateSettings({
                    refreshInterval: {
                      ...settings.refreshInterval,
                      list: Number(e.target.value),
                    },
                  })
                }
              >
                <option value={0}>默认</option>
                <option value={5000}>5秒</option>
                <option value={10000}>10秒</option>
                <option value={15000}>15秒</option>
                <option value={30000}>30秒</option>
              </select>
            </div>

            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>个股详情</span>
                <span className={styles.settingDesc}>详情页行情、分时、K 线相关刷新间隔</span>
              </div>
              <select
                className={styles.select}
                value={settings.refreshInterval.detail}
                onChange={(e) =>
                  updateSettings({
                    refreshInterval: {
                      ...settings.refreshInterval,
                      detail: Number(e.target.value),
                    },
                  })
                }
              >
                <option value={5000}>5秒</option>
                <option value={10000}>10秒</option>
                <option value={15000}>15秒</option>
                <option value={30000}>30秒</option>
              </select>
            </div>

            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>热力图</span>
                <span className={styles.settingDesc}>热力图个股数据刷新间隔</span>
              </div>
              <select
                className={styles.select}
                value={settings.refreshInterval.heatmap}
                onChange={(e) =>
                  updateSettings({
                    refreshInterval: {
                      ...settings.refreshInterval,
                      heatmap: Number(e.target.value),
                    },
                  })
                }
              >
                <option value={5000}>5秒</option>
                <option value={10000}>10秒</option>
                <option value={15000}>15秒</option>
                <option value={30000}>30秒</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <Palette size={18} className={styles.sectionIcon} />
            <h3>色彩模式</h3>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>涨跌颜色</span>
                <span className={styles.settingDesc}>全局页面和热力图默认使用同一颜色模式</span>
              </div>
              <div className={styles.colorModeOptions}>
                <button
                  className={`${styles.colorModeBtn} ${settings.colorMode === 'red-rise' ? styles.active : ''}`}
                  onClick={() =>
                    updateSettings({
                      colorMode: 'red-rise',
                      heatmapConfig: {
                        ...settings.heatmapConfig,
                        colorMode: 'red-rise',
                      },
                    })
                  }
                >
                  <span className={styles.riseRed}>涨</span>
                  <span className={styles.fallGreen}>跌</span>
                  红涨绿跌
                </button>
                <button
                  className={`${styles.colorModeBtn} ${settings.colorMode === 'green-rise' ? styles.active : ''}`}
                  onClick={() =>
                    updateSettings({
                      colorMode: 'green-rise',
                      heatmapConfig: {
                        ...settings.heatmapConfig,
                        colorMode: 'green-rise',
                      },
                    })
                  }
                >
                  <span className={styles.riseGreen}>涨</span>
                  <span className={styles.fallRed}>跌</span>
                  绿涨红跌
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <BarChart2 size={18} className={styles.sectionIcon} />
            <h3>指标参数</h3>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>MA 周期</span>
                <span className={styles.settingDesc}>逗号分隔，默认用于详情页均线</span>
              </div>
              <input
                className={styles.textInput}
                value={maDraft}
                onChange={(e) => setMaDraft(e.target.value)}
                onBlur={() => {
                  const next = parsePeriods(maDraft, settings.indicatorConfig.ma);
                  setMaDraft(next.join(', '));
                  updateIndicatorConfig({ ma: next });
                }}
              />
            </div>

            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>MACD</span>
                <span className={styles.settingDesc}>短 / 长 / 信号</span>
              </div>
              <div className={styles.inlineInputs}>
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.macd.short}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      macd: {
                        ...settings.indicatorConfig.macd,
                        short: Number(e.target.value) || 12,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.macd.long}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      macd: {
                        ...settings.indicatorConfig.macd,
                        long: Number(e.target.value) || 26,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.macd.signal}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      macd: {
                        ...settings.indicatorConfig.macd,
                        signal: Number(e.target.value) || 9,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>BOLL</span>
                <span className={styles.settingDesc}>周期 / 标准差</span>
              </div>
              <div className={styles.inlineInputs}>
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.boll.period}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      boll: {
                        ...settings.indicatorConfig.boll,
                        period: Number(e.target.value) || 20,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  step="0.1"
                  value={settings.indicatorConfig.boll.stdDev}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      boll: {
                        ...settings.indicatorConfig.boll,
                        stdDev: Number(e.target.value) || 2,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>KDJ</span>
                <span className={styles.settingDesc}>周期 / K / D</span>
              </div>
              <div className={styles.inlineInputs}>
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.kdj.period}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      kdj: {
                        ...settings.indicatorConfig.kdj,
                        period: Number(e.target.value) || 9,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.kdj.kPeriod}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      kdj: {
                        ...settings.indicatorConfig.kdj,
                        kPeriod: Number(e.target.value) || 3,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.kdj.dPeriod}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      kdj: {
                        ...settings.indicatorConfig.kdj,
                        dPeriod: Number(e.target.value) || 3,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>RSI 周期</span>
                <span className={styles.settingDesc}>逗号分隔，默认用于详情页 RSI</span>
              </div>
              <input
                className={styles.textInput}
                value={rsiDraft}
                onChange={(e) => setRsiDraft(e.target.value)}
                onBlur={() => {
                  const next = parsePeriods(rsiDraft, settings.indicatorConfig.rsi);
                  setRsiDraft(next.join(', '));
                  updateIndicatorConfig({ rsi: next });
                }}
              />
            </div>

            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>DMI / ADX</span>
                <span className={styles.settingDesc}>默认趋势强度参数</span>
              </div>
              <div className={styles.inlineInputs}>
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.dmi.period}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      dmi: {
                        ...settings.indicatorConfig.dmi,
                        period: Number(e.target.value) || 14,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.dmi.adxPeriod}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      dmi: {
                        ...settings.indicatorConfig.dmi,
                        adxPeriod: Number(e.target.value) || 14,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>SAR</span>
                <span className={styles.settingDesc}>起始 / 增量 / 最大加速</span>
              </div>
              <div className={styles.inlineInputs}>
                <input
                  className={styles.numberInput}
                  type="number"
                  step="0.01"
                  value={settings.indicatorConfig.sar.afStart}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      sar: {
                        ...settings.indicatorConfig.sar,
                        afStart: Number(e.target.value) || 0.02,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  step="0.01"
                  value={settings.indicatorConfig.sar.afIncrement}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      sar: {
                        ...settings.indicatorConfig.sar,
                        afIncrement: Number(e.target.value) || 0.02,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  step="0.01"
                  value={settings.indicatorConfig.sar.afMax}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      sar: {
                        ...settings.indicatorConfig.sar,
                        afMax: Number(e.target.value) || 0.2,
                      },
                    })
                  }
                />
              </div>
            </div>

            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingLabel}>KC</span>
                <span className={styles.settingDesc}>EMA / ATR / 倍数</span>
              </div>
              <div className={styles.inlineInputs}>
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.kc.emaPeriod}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      kc: {
                        ...settings.indicatorConfig.kc,
                        emaPeriod: Number(e.target.value) || 20,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  value={settings.indicatorConfig.kc.atrPeriod}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      kc: {
                        ...settings.indicatorConfig.kc,
                        atrPeriod: Number(e.target.value) || 10,
                      },
                    })
                  }
                />
                <input
                  className={styles.numberInput}
                  type="number"
                  step="0.1"
                  value={settings.indicatorConfig.kc.multiplier}
                  onChange={(e) =>
                    updateIndicatorConfig({
                      kc: {
                        ...settings.indicatorConfig.kc,
                        multiplier: Number(e.target.value) || 2,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <Info size={18} className={styles.sectionIcon} />
            <h3>关于</h3>
          </div>
          <div className={styles.sectionContent}>
            <div className={styles.aboutInfo}>
              <p><strong>A 股看板</strong> v1.1.0</p>
              <p className={styles.aboutDesc}>
                纯前端行情看板，核心数据能力来自 <strong>stock-sdk v2</strong>。
              </p>
              <p className={styles.aboutNote}>
                <strong>数据说明：</strong>
              </p>
              <ul className={styles.noteList}>
                <li>成交量单位：手（1手=100股）</li>
                <li>成交额单位：万元</li>
                <li>资金流、北向、龙虎榜等新增数据默认使用元级展示</li>
                <li>市值单位：亿元</li>
                <li>仅 A 股详情页已完全接入，港股 / 美股 / 基金结果暂不跳详情</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
