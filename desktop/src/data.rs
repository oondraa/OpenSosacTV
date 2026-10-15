//! Malá obdoba React Query: dotazy podle klíče, výsledky v paměti, načítání na
//! pozadí v tokiu. UI se ptá každý snímek a dostane, co zrovna je.
//! Zastaralá data se ukazují dál a mezitím se stáhnou znovu.

use std::any::Any;
use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use eframe::egui;

pub enum Load<T> {
    Pending,
    Ready(Arc<T>),
    Failed(String),
}

impl<T> Load<T> {
    pub fn ready(&self) -> Option<&Arc<T>> {
        match self {
            Load::Ready(v) => Some(v),
            _ => None,
        }
    }
}

type Value = Arc<dyn Any + Send + Sync>;

struct Slot {
    value: Option<Result<Value, String>>,
    fetched: Option<Instant>,
    in_flight: bool,
    /// Zvýší se při `clear`: výsledek staršího dotazu se zahodí.
    generation: u64,
}

pub struct Data {
    runtime: tokio::runtime::Runtime,
    ctx: egui::Context,
    slots: Arc<Mutex<HashMap<String, Slot>>>,
    generation: Arc<Mutex<u64>>,
}

impl Data {
    pub fn new(ctx: egui::Context) -> Self {
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(4)
            .enable_all()
            .build()
            .expect("tokio");
        Self {
            runtime,
            ctx,
            slots: Arc::default(),
            generation: Arc::default(),
        }
    }

    /// Spustí úlohu na pozadí a po doběhnutí překreslí okno.
    pub fn spawn(&self, task: impl Future<Output = ()> + Send + 'static) {
        let ctx = self.ctx.clone();
        self.runtime.spawn(async move {
            task.await;
            ctx.request_repaint();
        });
    }

    /// Vrátí stav dotazu `key`. Když chybí nebo je starší než `ttl`, spustí `fetch`.
    pub fn get<T, F, Fut>(&self, key: &str, ttl: Duration, fetch: F) -> Load<T>
    where
        T: Send + Sync + 'static,
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<T, String>> + Send + 'static,
    {
        let generation = *self.generation.lock().unwrap();
        let mut slots = self.slots.lock().unwrap();
        let slot = slots.entry(key.to_owned()).or_insert(Slot {
            value: None,
            fetched: None,
            in_flight: false,
            generation,
        });
        let stale = slot.fetched.is_none_or(|t| t.elapsed() > ttl);
        // Chyba se znovu nezkouší sama, jen přes `retry` (jinak by se API spamovalo).
        let failed = matches!(slot.value, Some(Err(_)));
        if stale && !slot.in_flight && !failed {
            slot.in_flight = true;
            slot.generation = generation;
            let future = fetch();
            let slots = Arc::clone(&self.slots);
            let key = key.to_owned();
            self.spawn(async move {
                let result = future.await.map(|v| Arc::new(v) as Value);
                let mut slots = slots.lock().unwrap();
                if let Some(slot) = slots.get_mut(&key).filter(|s| s.generation == generation) {
                    // Chyba při obnově nepřepíše data, která už máme.
                    if result.is_ok() || !matches!(slot.value, Some(Ok(_))) {
                        slot.value = Some(result);
                    }
                    slot.fetched = Some(Instant::now());
                    slot.in_flight = false;
                }
            });
        }
        match &slot.value {
            Some(Ok(v)) => v
                .clone()
                .downcast::<T>()
                .map_or_else(|_| Load::Failed("špatný typ v cache".into()), Load::Ready),
            Some(Err(e)) => Load::Failed(e.clone()),
            None => Load::Pending,
        }
    }

    /// Optimistický zápis (fronta po kliknutí na Chci vidět).
    pub fn set<T: Send + Sync + 'static>(&self, key: &str, value: T) {
        let generation = *self.generation.lock().unwrap();
        let mut slots = self.slots.lock().unwrap();
        let slot = slots.entry(key.to_owned()).or_insert(Slot {
            value: None,
            fetched: None,
            in_flight: false,
            generation,
        });
        slot.value = Some(Ok(Arc::new(value)));
        slot.fetched = Some(Instant::now());
    }

    /// Označí dotazy s prefixem za zastaralé, příští `get` je stáhne znovu.
    pub fn invalidate(&self, prefix: &str) {
        for (key, slot) in self.slots.lock().unwrap().iter_mut() {
            if key.starts_with(prefix) {
                slot.fetched = None;
            }
        }
        self.ctx.request_repaint();
    }

    /// Zapomene chybu, aby se dotaz zkusil znovu.
    pub fn retry(&self, key: &str) {
        let mut slots = self.slots.lock().unwrap();
        if slots
            .get(key)
            .is_some_and(|s| matches!(s.value, Some(Err(_))))
        {
            slots.remove(key);
        }
    }

    /// Po přihlášení a odhlášení: data se liší podle uživatele.
    pub fn clear(&self) {
        *self.generation.lock().unwrap() += 1;
        self.slots.lock().unwrap().clear();
    }
}
