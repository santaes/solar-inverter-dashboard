    const disabledButtonObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => refreshDisabledButtonHints(mutation.target));
    });
    disabledButtonObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['disabled'],
      subtree: true
    });

    applyTheme(initialTheme(), false);
    applyLanguage(initialLanguage(), false);

    // Poll rate and read mode are now in the modbus debug modal
    document.querySelector('#demo-button').addEventListener('click', fillChartExampleData);
    document.querySelector('#chart-demo-button').addEventListener('click', fillChartExampleData);
    document.querySelector('#manage-values-button').addEventListener('click', openGaugePicker);
    document.querySelector('#register-log-start')?.addEventListener('click', () => updateRegisterLog('start'));
    document.querySelector('#register-log-stop')?.addEventListener('click', () => updateRegisterLog('stop'));
   document.querySelector('#register-log-mark')?.addEventListener('click', () =>
        updateRegisterLog('mark', document.querySelector('#register-log-note').value));
    document.querySelector('#register-log-note')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') updateRegisterLog('mark', event.currentTarget.value);
    });
   /*  document.querySelector('#register-map-upload-button').addEventListener('click', () =>
      document.querySelector('#register-map-file').click());
    document.querySelector('#register-map-file').addEventListener('change', event =>
      void uploadRegisterMap(event.currentTarget.files?.[0]));
    document.querySelector('#search').addEventListener('input', () => {
      registerRenderLimit = REGISTER_RENDER_LIMIT;
      demoRegisterRows
        ? renderRegisters(demoRegisterRows)
        : lastData && renderRegisters(lastData.registers);
    }); */
/*     document.querySelector('#register-load-more').addEventListener('click', () => {
      registerRenderLimit += REGISTER_RENDER_LIMIT;
      demoRegisterRows
        ? renderRegisters(demoRegisterRows)
        : lastData && renderRegisters(lastData.registers);
    }); */
    document.querySelector('.view-tabs').addEventListener('click', event => {
      const tab = event.target.closest('.view-tab[data-view]');
      if (tab) showView(tab.dataset.view);
    });
    document.querySelector('.view-tabs').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...event.currentTarget.querySelectorAll('.view-tab[data-view]')];
      const currentIndex = Math.max(0, tabs.indexOf(document.activeElement));
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[nextIndex].focus();
      showView(tabs[nextIndex].dataset.view);
    });
    let lcdEnterHoldTimer = null;
    const lcdControls = document.querySelector('.lcd-controls');
    lcdControls.addEventListener('click', event => {
      const button = event.target.closest('[data-lcd-key]');
      if (button && button.dataset.lcdKey !== 'enter') handleLcdKey(button.dataset.lcdKey);
    });
    
    // Period selector for LCD energy display
    const lcdPeriodSelector = document.querySelector('.lcd-period-selector');
    if (lcdPeriodSelector) {
      // Initialize default selection (DAY)
      const periodButtons = lcdPeriodSelector.querySelectorAll('b');
      periodButtons.forEach(b => {
        if (b.textContent.trim() === 'DAY') {
          b.classList.add('lcd-period-active');
        }
      });
      
      lcdPeriodSelector.addEventListener('click', event => {
        const periodButton = event.target.closest('b');
        if (!periodButton) return;
        
        const periodText = periodButton.textContent.trim();
        if (periodText === 'SETTING') return; // Setting is not a period
        
        const periodMap = {'DAY': 'day', 'MONTH': 'month', 'YEAR': 'year'};
        const newPeriod = periodMap[periodText];
        if (newPeriod && window.lcdEnergyPeriod !== newPeriod) {
          window.lcdEnergyPeriod = newPeriod;
          // Update visual selection
          periodButtons.forEach(b => {
            b.classList.toggle('lcd-period-active', b === periodButton);
          });
          // Re-render LCD with new period
          if (lastData) {
            renderLcd(lastData, chartDemoRunning && demoRegisterRows ? demoRegisterRows : lastData.registers);
          }
        }
      });
    }
    lcdControls.addEventListener('pointerdown', event => {
      const button = event.target.closest('[data-lcd-key="enter"]');
      if (!button || event.button !== 0) return;
      window.clearTimeout(lcdEnterHoldTimer);
      lcdEnterHoldTimer = window.setTimeout(() => {
        lcdEnterHoldTimer = null;
        handleLcdEnterHold();
      }, 2000);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => lcdControls.addEventListener(type, () => {
      if (lcdEnterHoldTimer !== null) window.clearTimeout(lcdEnterHoldTimer);
      lcdEnterHoldTimer = null;
    }));
    window.addEventListener('keydown', event => {
      if (currentView !== 'lcd' || event.target?.closest?.('input, select, textarea')) return;
      const key = ({Escape:'escape', ArrowUp:'up', ArrowDown:'down', Enter:'enter'})[event.key];
      if (!key) return;
      event.preventDefault();
      handleLcdKey(key);
    });
    document.querySelector('#app-toggle').addEventListener('click', async event => {
      if (!lastData) return;
      const toggleButton = event.currentTarget;
      const paused = !lastData.paused;
      lastData.paused = paused;
      render(lastData);
      toggleButton.disabled = true;
      try {
        await updateSetting('paused', paused);
      } finally {
        toggleButton.disabled = false;
      }
    });
    document.querySelector('#theme-toggle').addEventListener('change', event =>
      applyTheme(event.target.checked ? 'light' : 'dark'));
    document.querySelector('.language-switch').addEventListener('click', event => {
      const button = event.target.closest('button[data-language]');
      if (button) applyLanguage(button.dataset.language);
    });
    document.querySelector('#chart-grid').addEventListener('click', event => {
      const pageButton = event.target.closest('button[data-chart-page]');
      if (pageButton && !pageButton.disabled) {
        changeChartPage(pageButton.dataset.chartPage);
        return;
      }
      const card = event.target.closest('[data-open-chart]');
      if (card) openChartModal(card.dataset.openChart);
    });
    document.querySelector('#chart-grid').addEventListener('keydown', event => {
      const card = event.target.closest('[data-open-chart]');
      if (card && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openChartModal(card.dataset.openChart);
      }
    });
    document.querySelector('#chart-selection-search').addEventListener('input', renderChartSelectionList);
    document.querySelector('#chart-selection-list').addEventListener('change', event => {
      const input = event.target.closest('[data-chart-selection-key]');
      if (input) setChartSelection(input.dataset.chartSelectionKey, input.checked);
    });
    document.querySelector('#chart-modal-close').addEventListener('click', closeChartModal);
    document.querySelector('#chart-modal-reset').addEventListener('click', () => resetChartZoom());
    document.querySelector('#chart-modal').addEventListener('click', event => {
      if (event.target === event.currentTarget) closeChartModal();
    });
    document.querySelector('#chart-modal').addEventListener('close', () => {
      modalChartPlot?.destroy();
      modalChartPlot = null;
      modalChartKey = '';
    });
    document.querySelector('#dashboard-clear-gauges').addEventListener('click', clearDashboardSelections);
    document.querySelector('#gauge-picker-search').addEventListener('input', renderGaugePickerList);
    document.querySelector('#select-all-gauges').addEventListener('click', selectAllGaugeSelections);
    document.querySelector('#clear-all-gauges').addEventListener('click', clearDashboardSelections);
    document.querySelector('#gauge-picker-list').addEventListener('change', event => {
      const checkbox = event.target.closest('input[data-picker-value-key]');
      if (!checkbox) return;
      const key = checkbox.dataset.pickerValueKey;
      if (checkbox.checked) {
        dashboardSelections.add(key);
      } else {
        dashboardSelections.delete(key);
      }
      saveSelections('inverter-dashboard-gauges-v2', dashboardSelections);
      renderDashboardValues();
      updateGaugeSelectionActions();
    });
    document.querySelector('[data-close-gauge-picker]').addEventListener('click', () =>
      document.querySelector('#gauge-picker').close());
    document.querySelector('#gauge-picker').addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    document.querySelector('.energy-flow-diagram').addEventListener('click', event => {
      const button = event.target.closest('[data-flow-card-settings]');
      if (button) openFlowCardPicker(button.dataset.flowCardSettings);
    });
    document.querySelector('#flow-card-picker-search').addEventListener('input', renderFlowCardPickerList);
    document.querySelector('#flow-card-picker-list').addEventListener('change', event => {
      const input = event.target.closest('[data-flow-card-register]');
      if (input) setFlowCardRegister(Number(input.dataset.flowCardRegister), input.checked);
    });
    document.querySelector('[data-close-flow-card-picker]').addEventListener('click', () =>
      document.querySelector('#flow-card-picker').close());
    document.querySelector('#flow-card-picker').addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    document.querySelector('#settings-button').addEventListener('click', () => {
      const picker = document.querySelector('#settings-picker');
      document.querySelector('#custom-device-name').value = getCustomDeviceName();
      try {
        const savedMode = window.localStorage.getItem('connection-mode') || 'rtu';
        document.querySelector('#connection-mode').value = savedMode;
      } catch {
        document.querySelector('#connection-mode').value = 'rtu';
      }
      if (typeof picker.showModal === 'function') picker.showModal();
      else picker.setAttribute('open', '');
    });
    document.querySelector('[data-close-settings-picker]').addEventListener('click', () =>
      document.querySelector('#settings-picker').close());
    document.querySelector('#settings-picker').addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    document.querySelector('#logs-button').addEventListener('click', () => {
      const picker = document.querySelector('#logs-picker');
      loadLogs();
      if (typeof picker.showModal === 'function') picker.showModal();
      else picker.setAttribute('open', '');
    });
    document.querySelector('[data-close-logs-picker]').addEventListener('click', () =>
      document.querySelector('#logs-picker').close());
    document.querySelector('#logs-picker').addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    document.querySelector('#refresh-logs').addEventListener('click', loadLogs);

    async function loadLocalUpdaterHistory() {
      const loading = document.querySelector('#updater-history-loading');
      const list = document.querySelector('#updater-history-list');
      loading.hidden = false;
      list.replaceChildren();
      try {
        const response = await fetch('/api/updater-history', {cache: 'no-store'});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        const github = data.github_status;
        if (github?.available) {
          const card = document.createElement('article');
          card.className = 'updater-history-item';
          const title = document.createElement('strong');
          title.textContent = t('githubStatusTitle');
          const dashboard = document.createElement('span');
          dashboard.textContent = t('githubStatusDashboard', {version: github.dashboard_version});
          const local = document.createElement('span');
          local.textContent = t('githubStatusLocal', {
            hash: github.local.hash.slice(0, 7), subject: github.local.subject
          });
          const remote = document.createElement('span');
          remote.textContent = t('githubStatusRemote', {
            hash: github.remote.hash.slice(0, 7), subject: github.remote.subject
          });
          const result = document.createElement('small');
          if (github.ahead === 0 && github.behind === 0) {
            result.textContent = t('githubStatusUpToDate');
          } else if (github.ahead === 0) {
            result.textContent = t('githubStatusUpdateAvailable', {count: github.behind});
          } else if (github.behind === 0) {
            result.textContent = t('githubStatusLocalAhead', {count: github.ahead});
          } else {
            result.textContent = t('githubStatusDiverged', {ahead: github.ahead, behind: github.behind});
          }
          card.append(title, dashboard, local, remote, result);
          list.appendChild(card);
        } else if (github?.error) {
          const unavailable = document.createElement('div');
          unavailable.className = 'muted';
          unavailable.style.padding = '12px';
          unavailable.textContent = t('githubStatusUnavailable', {error: github.error});
          list.appendChild(unavailable);
        }
        if (!data.history?.length && !list.childElementCount) {
          const empty = document.createElement('div');
          empty.className = 'muted';
          empty.style.padding = '12px';
          empty.textContent = t('updaterHistoryEmpty');
          list.appendChild(empty);
          return;
        }
        const locale = currentLanguage === 'uk' ? 'uk-UA' : currentLanguage === 'ru' ? 'ru-RU' : 'en-GB';
        data.history.forEach(item => {
          const card = document.createElement('article');
          card.className = 'updater-history-item';
          const installedAt = new Date(`${item.installed_at.replace(' ', 'T')}Z`);
          const time = Number.isNaN(installedAt.valueOf()) ? item.installed_at : installedAt.toLocaleString(locale);
          const version = document.createElement('strong');
          version.textContent = t('updaterVersion', {version: item.version});
          const dashboardBuild = document.createElement('span');
          dashboardBuild.textContent = item.dashboard_version
            ? t('dashboardBuild', {version: item.dashboard_version})
            : t('dashboardBuildUnknown');
          const date = document.createElement('span');
          date.textContent = t('updaterInstalledAt', {date: time});
          const checksum = document.createElement('small');
          checksum.textContent = item.checksum || '';
          const download = document.createElement('a');
          download.className = 'updater-history-download';
          if (item.download_available) {
            download.href = `/api/updater-history/download?file=${encodeURIComponent(item.archive_file)}`;
            download.textContent = t('downloadUpdater');
            download.setAttribute('download', item.archive_file);
          } else {
            download.textContent = t('updaterArchiveUnavailable');
            download.setAttribute('aria-disabled', 'true');
          }
          card.append(version, dashboardBuild, date, checksum, download);
          list.appendChild(card);
        });
      } catch (error) {
        const failed = document.createElement('div');
        failed.className = 'error-text';
        failed.style.padding = '12px';
        failed.textContent = t('updaterHistoryLoadError', {error: error.message});
        list.appendChild(failed);
      } finally {
        loading.hidden = true;
      }
    }
    document.querySelector('#updater-history-button').addEventListener('click', () => {
      const picker = document.querySelector('#updater-history-picker');
      void loadLocalUpdaterHistory();
      if (typeof picker.showModal === 'function') picker.showModal();
      else picker.setAttribute('open', '');
    });
    document.querySelector('[data-close-updater-history-picker]').addEventListener('click', () =>
      document.querySelector('#updater-history-picker').close());
    document.querySelector('#updater-history-picker').addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });

    // Compatibility guard for the removed Git-based updater UI.
    if (document.querySelector('#git-commits-button')) {
    // Git commits modal
    let selectedGitCommit = null;
    let selectedUpdaterId = null;
    document.querySelector('#git-commits-button').addEventListener('click', async () => {
      const picker = document.querySelector('#git-commits-picker');
      const loadingDiv = document.querySelector('#git-commits-loading');
      const listDiv = document.querySelector('#git-commits-list');
      const actionsDiv = document.querySelector('#git-commits-actions');
      const historyLoadingDiv = document.querySelector('#updater-history-loading');
      const historyListDiv = document.querySelector('#updater-history-list');

      loadingDiv.style.display = 'block';
      listDiv.innerHTML = '';
      actionsDiv.style.display = 'none';
      selectedGitCommit = null;

      // Load updater history
      historyLoadingDiv.style.display = 'block';
      historyListDiv.innerHTML = '';
      selectedUpdaterId = null;
      document.querySelector('#updater-history-actions').style.display = 'none';
      loadUpdaterHistory();

      if (typeof picker.showModal === 'function') picker.showModal();
      else picker.setAttribute('open', '');

      // Check git availability first
      try {
        const checkResponse = await fetch('/api/git/check');
        const checkData = await checkResponse.json();

        if (!checkData.available) {
          loadingDiv.style.display = 'none';
          listDiv.innerHTML = `
            <div style="padding: 20px; text-align: center;">
              <div style="color: var(--red); margin-bottom: 15px;">${t('gitNotInstalled')}</div>
              <div style="margin-bottom: 10px; font-size: 12px; color: var(--muted);">${checkData.error}</div>
              <button id="install-git-button" type="button" style="padding: 8px 16px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--panel); color: var(--text);">${t('gitInstallButton')}</button>
            </div>
          `;
          document.querySelector('#install-git-button').addEventListener('click', async () => {
            const button = document.querySelector('#install-git-button');
            button.disabled = true;
            button.textContent = t('gitInstalling');
            try {
              const installResponse = await fetch('/api/git/install', {method: 'POST'});
              const installData = await installResponse.json();
              if (installData.success) {
                alert(t('gitInstallSuccess'));
                // Reload commits after successful installation
                loadingDiv.style.display = 'block';
                listDiv.innerHTML = '';
                loadCommits();
              } else {
                alert(`${t('gitInstallFailed')}: ${installData.message}`);
                button.disabled = false;
                button.textContent = t('gitInstallButton');
              }
            } catch (error) {
              alert(`${t('gitInstallFailed')}: ${error}`);
              button.disabled = false;
              button.textContent = t('gitInstallButton');
            }
          });
          return;
        }

        // Git is available, load commits
        loadCommits();
      } catch (error) {
        loadingDiv.style.display = 'none';
        listDiv.innerHTML = `<div style="color: var(--red); padding: 20px;">Failed to check git: ${error}</div>`;
      }
    });

    async function loadCommits() {
      const loadingDiv = document.querySelector('#git-commits-loading');
      const listDiv = document.querySelector('#git-commits-list');
      const actionsDiv = document.querySelector('#git-commits-actions');

      try {
        const response = await fetch('/api/git/commits');
        const data = await response.json();

        loadingDiv.style.display = 'none';

        if (data.error) {
          listDiv.innerHTML = `<div style="color: var(--red); padding: 20px;">${data.error}</div>`;
          return;
        }

        if (!data.commits || data.commits.length === 0) {
          listDiv.innerHTML = '<div style="padding: 20px;">No commits found</div>';
          return;
        }

        listDiv.innerHTML = data.commits.map(commit => `
          <div class="commit-item" data-commit-hash="${commit.hash}" style="
            padding: 12px;
            border: 1px solid var(--ui-border);
            border-radius: 8px;
            margin-bottom: 8px;
            cursor: pointer;
            background: var(--panel);
          ">
            <div style="font-weight: 700; font-size: 12px; color: var(--accent);">${commit.hash.substring(0, 7)}</div>
            <div style="font-size: 11px; color: var(--muted); margin: 4px 0;">${commit.date}</div>
            <div style="font-size: 13px;">${commit.message}</div>
          </div>
        `).join('');

        listDiv.querySelectorAll('.commit-item').forEach(item => {
          item.addEventListener('click', () => {
            listDiv.querySelectorAll('.commit-item').forEach(i => i.style.borderColor = 'var(--ui-border)');
            item.style.borderColor = 'var(--cyan)';
            selectedGitCommit = item.dataset.commitHash;
            actionsDiv.style.display = 'block';
            document.querySelector('#selected-commit-info').textContent = t('selectedCommit', {hash: selectedGitCommit.substring(0, 7)});
          });
        });
      } catch (error) {
        loadingDiv.style.display = 'none';
        listDiv.innerHTML = `<div style="color: var(--red); padding: 20px;">Failed to load commits: ${error}</div>`;
      }
    }

    document.querySelector('[data-close-git-commits-picker]').addEventListener('click', () =>
      document.querySelector('#git-commits-picker').close());
    document.querySelector('#git-commits-picker').addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });

    document.querySelector('#generate-update-from-commit').addEventListener('click', async () => {
      if (!selectedGitCommit) return;

      const button = document.querySelector('#generate-update-from-commit');
      button.disabled = true;
      button.textContent = 'Generating...';

      try {
        const response = await fetch('/api/git/checkout-and-build', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({commit: selectedGitCommit})
        });

        const data = await response.json();

        if (data.error) {
          alert(`Error: ${data.error}`);
        } else if (data.success) {
          alert(`Update bundle generated: ${data.bundlePath}`);
          // Trigger download
          window.location.href = data.downloadUrl;
        }
      } catch (error) {
        alert(`Failed to generate update: ${error}`);
      } finally {
        button.disabled = false;
        button.textContent = t('generateUpdate');
      }
    });

    document.querySelector('#download-from-github').addEventListener('click', async () => {
      if (!selectedGitCommit) return;

      const button = document.querySelector('#download-from-github');
      const tokenInput = document.querySelector('#github-token');
      const repoUrlInput = document.querySelector('#github-repo-url');
      const token = tokenInput.value.trim();
      const repoUrl = repoUrlInput.value.trim();

      button.disabled = true;
      button.textContent = 'Downloading...';

      try {
        const response = await fetch('/api/git/download-from-github', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({commit: selectedGitCommit, token: token || null, repo_url: repoUrl || null})
        });

        const data = await response.json();

        if (data.error) {
          alert(`Error: ${data.error}`);
        } else if (data.success) {
          alert(`Downloaded from GitHub: ${data.fileName}`);
          // Trigger download
          window.location.href = data.downloadUrl;
        }
      } catch (error) {
        alert(`Failed to download from GitHub: ${error}`);
      } finally {
        button.disabled = false;
        button.textContent = t('downloadFromGitHub');
      }
    });

    async function loadUpdaterHistory() {
      const historyLoadingDiv = document.querySelector('#updater-history-loading');
      const historyListDiv = document.querySelector('#updater-history-list');

      try {
        const response = await fetch('/api/git/updater-history');
        const data = await response.json();

        historyLoadingDiv.style.display = 'none';

        if (data.error) {
          historyListDiv.innerHTML = `<div style="color: var(--red); padding: 10px; font-size: 12px;">${data.error}</div>`;
          return;
        }

        if (!data.history || data.history.length === 0) {
          historyListDiv.innerHTML = '<div style="padding: 10px; font-size: 12px; color: var(--muted);">No updater history</div>';
          return;
        }

        historyListDiv.innerHTML = data.history.map(item => `
          <div class="updater-history-item" data-updater-id="${item.id}" data-bundle-path="${item.bundle_path}" style="
            padding: 8px;
            border: 1px solid var(--ui-border);
            border-radius: 6px;
            margin-bottom: 6px;
            background: var(--panel);
            font-size: 11px;
            cursor: pointer;
          ">
            <div style="font-weight: 600; color: var(--accent);">${item.commit_hash.substring(0, 7)}</div>
            <div style="color: var(--muted); margin: 2px 0;">${item.created_at}</div>
            <div style="color: var(--text); margin-bottom: 2px;">${item.commit_message || 'No message'}</div>
            <div style="font-family: monospace; font-size: 10px; color: var(--muted); white-space: pre-wrap; word-break: break-all;">${item.build_output || ''}</div>
          </div>
        `).join('');

        // Add click handlers for history items
        historyListDiv.querySelectorAll('.updater-history-item').forEach(item => {
          item.addEventListener('click', () => {
            // Remove previous selection
            historyListDiv.querySelectorAll('.updater-history-item').forEach(i => {
              i.style.borderColor = 'var(--ui-border)';
              i.style.background = 'var(--panel)';
            });
            // Select this item
            item.style.borderColor = 'var(--accent)';
            item.style.background = 'rgba(var(--accent-rgb), 0.1)';
            selectedUpdaterId = item.dataset.updaterId;
            const bundlePath = item.dataset.bundlePath;
            const commitHash = item.querySelector('div').textContent;
            document.querySelector('#updater-history-actions').style.display = 'block';
            document.querySelector('#selected-updater-info').textContent = t('selectedUpdater', {hash: commitHash});
          });
        });
      } catch (error) {
        historyLoadingDiv.style.display = 'none';
        historyListDiv.innerHTML = `<div style="color: var(--red); padding: 10px; font-size: 12px;">Failed to load history: ${error}</div>`;
      }
    }

    document.querySelector('#download-selected-updater').addEventListener('click', () => {
      if (!selectedUpdaterId) return;
      const selectedItem = document.querySelector(`.updater-history-item[data-updater-id="${selectedUpdaterId}"]`);
      if (!selectedItem) return;
      const bundlePath = selectedItem.dataset.bundle_path;
      if (!bundlePath) {
        alert('Bundle path not available');
        return;
      }
      // Extract filename from path
      const filename = bundlePath.split('\\').pop().split('/').pop();
      // Trigger download
      window.location.href = `/api/git/download-bundle?filename=${filename}`;
    });
    }

    document.querySelector('#modbus-debug-button').addEventListener('click', () => {
      const picker = document.querySelector('#modbus-debug-picker');
      if (typeof picker.showModal === 'function') picker.showModal();
      else picker.setAttribute('open', '');
      loadModbusDebug();
      // Sync the debug modal controls with current settings
      const pollRateSelect = document.querySelector('#modbus-poll-rate');
      const readModeSelect = document.querySelector('#modbus-read-mode');
      const connectionModeSelect = document.querySelector('#modbus-connection-mode-select');
      if (lastData) {
        if (pollRateSelect) pollRateSelect.value = lastData.poll_rate_index ?? 2;
        if (readModeSelect) readModeSelect.value = lastData.read_mode ?? 'fast';
      } else {
        if (pollRateSelect) pollRateSelect.value = 2;
        if (readModeSelect) readModeSelect.value = 'fast';
      }
      try {
        const connectionMode = window.localStorage.getItem('connection-mode') || 'rtu';
        if (connectionModeSelect) connectionModeSelect.value = connectionMode;
      } catch {
        if (connectionModeSelect) connectionModeSelect.value = 'rtu';
      }
    });
    document.querySelector('[data-close-modbus-debug-picker]').addEventListener('click', () =>
      document.querySelector('#modbus-debug-picker').close());
    document.querySelector('#modbus-debug-picker').addEventListener('click', event => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    document.querySelector('#refresh-modbus-debug').addEventListener('click', loadModbusDebug);
    document.querySelector('#modbus-poll-rate').addEventListener('change', event => {
      const pollRateIndex = Number(event.target.value);
      if (lastData) {
        lastData.poll_rate_index = pollRateIndex;
        renderCycleStatus(lastData);
      }
      updateSetting('poll_rate_index', pollRateIndex);
    });
    document.querySelector('#modbus-read-mode').addEventListener('change', event => {
      const readMode = event.target.value;
      if (lastData) {
        lastData.read_mode = readMode;
      }
      updateSetting('read_mode', readMode);
    });
    document.querySelector('#modbus-connection-mode-select').addEventListener('change', event => {
      const connectionMode = event.target.value;
      try {
        window.localStorage.setItem('connection-mode', connectionMode);
      } catch {
      }
      fetch('/api/connection-mode', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'set', mode: connectionMode})
      }).catch(() => {
      });
      loadModbusDebug();
    });
    document.querySelector('#save-settings').addEventListener('click', () => {
      const customName = document.querySelector('#custom-device-name').value;
      const connectionMode = document.querySelector('#connection-mode').value;
      saveCustomDeviceName(customName);
      
      try {
        window.localStorage.setItem('connection-mode', connectionMode);
      } catch {
      }
      
      fetch('/api/connection-mode', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({action: 'set', mode: connectionMode})
      }).catch(() => {
      });
      
      document.querySelector('#settings-picker').close();
      if (lastData) {
        document.querySelector('#identifier').textContent = getDisplayIdentifier(lastData);
      }
    });
    const gaugeHost = document.querySelector('#gauges');
    const dashboardGaugeToolbar = document.querySelector('#dashboard-gauge-toolbar');
    let draggedGauge = null;
    let pointerDraggedGauge = null;
    let pointerDragHandle = null;

    function saveDashboardOrderFromCards() {
      const orderedKeys = [...gaugeHost.querySelectorAll('[data-dashboard-key]')]
        .map(card => card.dataset.dashboardKey)
        .filter(key => dashboardSelections.has(key));
      const visibleKeys = new Set(orderedKeys);
      const remainingKeys = [...dashboardSelections].filter(key => !visibleKeys.has(key));
      const insertionIndex = Math.min(
        dashboardGaugePage * DASHBOARD_GAUGES_PER_PAGE,
        remainingKeys.length
      );
      remainingKeys.splice(insertionIndex, 0, ...orderedKeys);
      dashboardSelections.clear();
      remainingKeys.forEach(key => dashboardSelections.add(key));
      saveSelections('inverter-dashboard-gauges-v2', dashboardSelections);
      renderDashboardValues();
    }

    function placeGaugeAtPointer(card, target, clientX, clientY) {
      gaugeHost.querySelectorAll('.drag-target').forEach(item => item.classList.remove('drag-target'));
      if (!target || target === card || !gaugeHost.contains(target)) return;
      target.classList.add('drag-target');
      const bounds = target.getBoundingClientRect();
      const cardBounds = card.getBoundingClientRect();
      const sameRow = Math.abs(bounds.top - cardBounds.top) < bounds.height / 2;
      const placeAfter = sameRow
        ? clientX > bounds.left + bounds.width / 2
        : clientY > bounds.top + bounds.height / 2;
      target[placeAfter ? 'after' : 'before'](card);
    }

    gaugeHost.addEventListener('dragstart', event => {
      const card = event.target.closest('.gauge-card[data-dashboard-key]');
      if (!card) return;
      draggedGauge = card;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.dashboardKey);
    });
    gaugeHost.addEventListener('dragover', event => {
      if (!draggedGauge) return;
      event.preventDefault();
      const target = event.target.closest('.gauge-card[data-dashboard-key]');
      placeGaugeAtPointer(draggedGauge, target, event.clientX, event.clientY);
    });
    gaugeHost.addEventListener('drop', event => {
      if (!draggedGauge) return;
      event.preventDefault();
      saveDashboardOrderFromCards();
    });
    gaugeHost.addEventListener('dragend', () => {
      gaugeHost.querySelectorAll('.dragging, .drag-target').forEach(card =>
        card.classList.remove('dragging', 'drag-target'));
      draggedGauge = null;
    });

    gaugeHost.addEventListener('pointerdown', event => {
      const handle = event.target.closest('.drag-handle');
      if (!handle || event.button !== 0 || event.isPrimary === false) return;
      const card = handle.closest('.gauge-card[data-dashboard-key]');
      if (!card) return;
      event.preventDefault();
      pointerDraggedGauge = card;
      pointerDragHandle = handle;
      card.classList.add('pointer-dragging');
      handle.setPointerCapture(event.pointerId);
    });

    gaugeHost.addEventListener('pointermove', event => {
      if (!pointerDraggedGauge || !pointerDragHandle) return;
      event.preventDefault();
      if (event.clientY < 70) window.scrollBy(0, -14);
      if (event.clientY > window.innerHeight - 70) window.scrollBy(0, 14);

      const previousVisibility = pointerDraggedGauge.style.visibility;
      pointerDraggedGauge.style.visibility = 'hidden';
      const elementBelow = document.elementFromPoint(event.clientX, event.clientY);
      pointerDraggedGauge.style.visibility = previousVisibility;
      const target = elementBelow?.closest('.gauge-card[data-dashboard-key]') || null;
      placeGaugeAtPointer(pointerDraggedGauge, target, event.clientX, event.clientY);
    });

    function finishPointerGaugeDrag(event) {
      if (!pointerDraggedGauge) return;
      if (pointerDragHandle?.hasPointerCapture(event.pointerId)) {
        pointerDragHandle.releasePointerCapture(event.pointerId);
      }
      pointerDraggedGauge.classList.remove('pointer-dragging');
      gaugeHost.querySelectorAll('.drag-target').forEach(card => card.classList.remove('drag-target'));
      pointerDraggedGauge = null;
      pointerDragHandle = null;
      saveDashboardOrderFromCards();
    }

    gaugeHost.addEventListener('pointerup', finishPointerGaugeDrag);
    gaugeHost.addEventListener('pointercancel', finishPointerGaugeDrag);

    function handleDashboardPaginationClick(event) {
      const pageButton = event.target.closest('button[data-dashboard-page]');
      if (pageButton && !pageButton.disabled) {
        changeDashboardGaugePage(pageButton.dataset.dashboardPage);
        return true;
      }
      return false;
    }
    dashboardGaugeToolbar.addEventListener('click', handleDashboardPaginationClick);

    gaugeHost.addEventListener('click', event => {
      if (handleDashboardPaginationClick(event)) return;
      if (event.target.closest('[data-open-gauge-picker]')) {
        openGaugePicker();
        return;
      }
      const button = event.target.closest('button[data-remove-dashboard]');
      if (!button) return;
      const key = button.dataset.removeDashboard;
      dashboardSelections.delete(key);
      saveSelections('inverter-dashboard-gauges-v2', dashboardSelections);
      renderDashboardValues();
      renderGaugePickerList();
    });
    window.addEventListener('resize', scheduleVisibleChartDraw);
    window.addEventListener('scroll', () => {
      if (!document.querySelector('#charts-view').hidden) scheduleVisibleChartDraw();
    }, {passive: true});
    document.addEventListener('visibilitychange', () => {
      if (!pageIsActive) return;
      scheduleDashboardVersionCheck(document.hidden ? null : 0);
      if (!lastData?.paused) scheduleRefresh(document.hidden ? null : 0);
    });
    window.addEventListener('pagehide', () => {
      pageIsActive = false;
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (versionCheckTimer !== null) window.clearTimeout(versionCheckTimer);
      refreshTimer = null;
      versionCheckTimer = null;
      refreshController?.abort();
      versionCheckController?.abort();
    });
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      pageIsActive = true;
      scheduleDashboardVersionCheck(0);
      if (!lastData?.paused) scheduleRefresh(0);
    });
    const initialData = window.__INITIAL_STATE__ ?? null;
    if (initialData) {
      lastData = initialData;
      render(initialData);
      recordChartSamples(initialData);
    } else {
      refresh();
    }
    window.addEventListener('load', () => {
      scheduleDashboardVersionCheck(0);
      if (!lastData?.paused) scheduleRefresh();
    }, {once: true});
    document.documentElement.classList.remove('booting');
