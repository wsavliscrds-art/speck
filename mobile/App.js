import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Linking,
  ActivityIndicator,
  StatusBar,
  Switch,
} from 'react-native';
import { api, whatsappLink, STATUS } from './src/api';

export default function App() {
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ total: 0, sem_site: 0, contatados: 0, fechados: 0 });
  const [onlyWithoutSite, setOnlyWithoutSite] = useState(true);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [ls, st] = await Promise.all([api.listLeads({ onlyWithoutSite }), api.stats()]);
      setLeads(ls);
      setStats(st);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [onlyWithoutSite]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // acompanha o job de busca
  useEffect(() => {
    if (!job || job.status === 'concluido' || job.status === 'erro') return;
    const t = setInterval(async () => {
      try {
        const j = await api.getJob(job.id);
        setJob(j);
        if (j.status === 'concluido') {
          setLoading(false);
          refresh();
        } else if (j.status === 'erro') {
          setLoading(false);
          setError('A busca falhou.');
        }
      } catch (e) {
        setError(e.message);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [job, refresh]);

  async function onSearch() {
    if (!query.trim()) return;
    setError('');
    setLoading(true);
    try {
      const j = await api.startSearch(query.trim());
      setJob(j);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  async function cycleStatus(lead) {
    const idx = STATUS.findIndex((s) => s.value === lead.status);
    const next = STATUS[(idx + 1) % STATUS.length].value;
    try {
      const updated = await api.updateLead(lead.id, { status: next });
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? updated : l)));
      api.stats().then(setStats);
    } catch (e) {
      setError(e.message);
    }
  }

  const running = loading || (job && job.status !== 'concluido' && job.status !== 'erro');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#115e59" />
      <View style={styles.header}>
        <Text style={styles.title}>📍 LeadMapa</Text>
        <Text style={styles.subtitle}>Empresas sem site perto de você</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Ex.: restaurantes em Campinas"
          placeholderTextColor="#94a3b8"
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={onSearch} disabled={running}>
          {running ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchBtnText}>Buscar</Text>}
        </TouchableOpacity>
      </View>

      {job && job.status === 'rodando' && (
        <Text style={styles.jobBar}>Buscando no Google Maps… pode levar alguns minutos.</Text>
      )}
      {job && job.status === 'concluido' && (
        <Text style={[styles.jobBar, styles.jobOk]}>
          {job.total} empresas — {job.without_site} sem site importadas.
        </Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.statsRow}>
        <StatBox label="Leads" value={stats.total} />
        <StatBox label="Sem site" value={stats.sem_site} hot />
        <StatBox label="Contatados" value={stats.contatados} />
        <StatBox label="Fechados" value={stats.fechados} />
      </View>

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Só quem não tem site</Text>
        <Switch value={onlyWithoutSite} onValueChange={setOnlyWithoutSite} />
      </View>

      <FlatList
        data={leads}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        onRefresh={refresh}
        refreshing={false}
        ListEmptyComponent={
          !running && <Text style={styles.empty}>Nenhum lead ainda. Faça uma busca acima.</Text>
        }
        renderItem={({ item }) => (
          <LeadCard item={item} onStatus={cycleStatus} />
        )}
      />
    </SafeAreaView>
  );
}

function StatBox({ label, value, hot }) {
  return (
    <View style={[styles.statBox, hot && styles.statBoxHot]}>
      <Text style={[styles.statValue, hot && styles.statValueHot]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LeadCard({ item, onStatus }) {
  const wa = whatsappLink(item.phone);
  const meta = STATUS.find((s) => s.value === item.status) || STATUS[0];
  return (
    <View style={[styles.card, !item.has_website && styles.cardHot]}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        {!item.has_website && <Text style={styles.badge}>SEM SITE</Text>}
      </View>
      <Text style={styles.cardMeta}>
        {[item.category, item.rating != null ? `⭐ ${item.rating} (${item.reviews})` : null]
          .filter(Boolean)
          .join('  ·  ')}
      </Text>
      {!!item.address && <Text style={styles.cardAddr}>{item.address}</Text>}
      {!!item.phone && <Text style={styles.cardPhone}>📞 {item.phone}</Text>}

      <View style={styles.cardActions}>
        {wa && (
          <TouchableOpacity style={[styles.actBtn, styles.wa]} onPress={() => Linking.openURL(wa)}>
            <Text style={styles.actWaText}>WhatsApp</Text>
          </TouchableOpacity>
        )}
        {!!item.phone && (
          <TouchableOpacity
            style={[styles.actBtn, styles.ghost]}
            onPress={() => Linking.openURL('tel:' + item.phone.replace(/[^\d+]/g, ''))}
          >
            <Text style={styles.ghostText}>Ligar</Text>
          </TouchableOpacity>
        )}
        {!!item.maps_link && (
          <TouchableOpacity
            style={[styles.actBtn, styles.ghost]}
            onPress={() => Linking.openURL(item.maps_link)}
          >
            <Text style={styles.ghostText}>Maps</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.statusBtn, { borderColor: meta.color }]}
        onPress={() => onStatus(item)}
      >
        <Text style={[styles.statusText, { color: meta.color }]}>
          {meta.label} (toque p/ mudar)
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { backgroundColor: '#0f766e', padding: 16, paddingTop: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#c7f9ef', fontSize: 13, marginTop: 2 },

  searchRow: { flexDirection: 'row', padding: 12, gap: 8 },
  input: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14,
    fontSize: 16, borderWidth: 1, borderColor: '#e2e8f0', height: 48,
  },
  searchBtn: {
    backgroundColor: '#0f766e', borderRadius: 12, paddingHorizontal: 18,
    justifyContent: 'center', minWidth: 84, alignItems: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700' },

  jobBar: {
    marginHorizontal: 12, marginBottom: 4, backgroundColor: '#ecfeff', color: '#155e63',
    padding: 10, borderRadius: 10, fontSize: 13,
  },
  jobOk: { backgroundColor: '#f0fdf4', color: '#166534' },
  error: { marginHorizontal: 12, color: '#991b1b', backgroundColor: '#fef2f2', padding: 10, borderRadius: 10 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginTop: 4 },
  statBox: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0',
  },
  statBoxHot: { backgroundColor: '#fff1f2', borderColor: '#fecaca' },
  statValue: { fontSize: 20, fontWeight: '800', color: '#115e59' },
  statValueHot: { color: '#ef4444' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },

  filterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  filterLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },

  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  cardHot: { borderLeftWidth: 4, borderLeftColor: '#ef4444' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', flex: 1, paddingRight: 8 },
  badge: { backgroundColor: '#ef4444', color: '#fff', fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  cardMeta: { color: '#64748b', fontSize: 13, marginTop: 4 },
  cardAddr: { color: '#64748b', fontSize: 13, marginTop: 4 },
  cardPhone: { fontSize: 15, fontWeight: '600', marginTop: 4 },

  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  actBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  wa: { backgroundColor: '#22c55e' },
  actWaText: { color: '#fff', fontWeight: '700' },
  ghost: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  ghostText: { color: '#0f172a', fontWeight: '600' },

  statusBtn: { marginTop: 10, borderWidth: 2, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  statusText: { fontWeight: '700' },
});
