<script>
    import "../app.css";
    import Header from "$lib/header.svelte";
    import Footer from "$lib/footer.svelte";
</script>

<Header />
<div class="main">
	<slot />
</div>

<Footer />

<style>
	.main {
		display: flex;
		height: 100%;
		width: 100%;
	}
</style>
