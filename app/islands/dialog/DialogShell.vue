<template>
  <form method="dialog">
    <div class="modal-heading">
      <h2 id="modal-title"></h2>
      <button value="cancel" aria-label="关闭" formnovalidate>×</button>
    </div>
    <p id="modal-description"></p>
    <div id="modal-content"></div>
    <p id="modal-error" role="alert"></p>
    <div class="modal-actions">
      <button value="cancel" formnovalidate>取消 / 关闭</button>
      <button id="modal-delete" type="button" hidden>删除</button>
      <button id="modal-apply" type="button" class="primary">应用</button>
    </div>
  </form>
</template>
